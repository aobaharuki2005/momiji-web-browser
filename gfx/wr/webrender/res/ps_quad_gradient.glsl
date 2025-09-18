/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// This shader renders any kind of css gradents in a color or alpha target.

#include ps_quad

#define PI 3.141592653589793

#define GRADIENT_KIND_LINEAR 0
#define GRADIENT_KIND_RADIAL 1
#define GRADIENT_KIND_CONIC  2

// All of the integer varyings are packed into this header (see decode_gradient_header).
flat varying highp ivec4 v_gradient_header;
// Gradient-specific varying parameters are packed into these two varyings.
varying highp vec4 v_interpolated_data;
flat varying highp vec4 v_flat_data;
// The first four stop offsets provided to the fragment shader to reduce the
// number of gpu buffer reads in the common case.
flat varying mediump vec4 v_stop_offsets;
// Two color stops provided via varyings, only used in the fast path with only
// two color stops.
flat varying mediump vec4 v_color0;
flat varying mediump vec4 v_color1;

#ifdef WR_VERTEX_SHADER

void linear_gradient_vertex(vec2 position, vec4 data0) {
    vec2 p0 = data0.xy;
    vec2 p1 = data0.zw;

    vec2 dir = p1 - p0;
    dir = dir / dot(dir, dir);
    float offset = dot(p0, dir);

    v_interpolated_data = vec4(position, 0.0, 0.0);
    v_flat_data = vec4(dir, offset, 0.0);
}

void radial_gradient_vertex(vec2 position, vec4 data0, vec4 data1) {
    vec2 center = data0.xy;
    vec2 scale = data0.zw;
    float start_radius = data1.x;
    float end_radius = data1.y;
    float xy_ratio = data1.z;

    // Store 1/rd where rd = end_radius - start_radius
    // If rd = 0, we can't get its reciprocal. Instead, just use a zero scale.
    float rd = end_radius - start_radius;
    float radius_scale = rd != 0.0 ? 1.0 / rd : 0.0;

    // Transform all coordinates by the y scale so the
    // fragment shader can work with circles

    // v_pos is in a coordinate space relative to the task rect
    // (so it is independent of the task origin).
    start_radius = start_radius * radius_scale;
    vec2 normalized_pos = (position * scale - center) * radius_scale;
    normalized_pos.y *= xy_ratio;

    v_interpolated_data = vec4(normalized_pos.x, normalized_pos.y, 0.0, 0.0);
    v_flat_data = vec4(start_radius, 0.0, 0.0, 0.0);
}

void conic_gradient_vertex(vec2 position, vec4 data0, vec4 data1) {
    vec2 center = data0.xy;
    vec2 scale = data0.zw;
    float start_offset = data1.x;
    float end_offset = data1.y;
    float angle = PI / 2.0 - data1.z;

    // Store 1/d where d = end_offset - start_offset
    // If d = 0, we can't get its reciprocal. Instead, just use a zero scale.
    float d = end_offset - start_offset;
    float offset_scale = d != 0.0 ? 1.0 / d : 0.0;

    start_offset = start_offset * offset_scale;
    vec2 dir = (position * scale - center);

    v_interpolated_data = vec4(dir, start_offset, offset_scale);
    v_flat_data = vec4(angle, 0.0, 0.0, 0.0);
}

ivec4 decode_gradient_header(int base_address, vec4 payload) {
    int kind = int(payload.x);
    float count = payload.y;
    int extend_mode = int(payload.z);
    int offsets_address = base_address + 1;
    int colors_address = offsets_address + int(ceil(count * 0.25));

    return ivec4(
        kind,
        int(count) | (extend_mode << 24),
        offsets_address,
        colors_address
    );
}

void pattern_vertex(PrimitiveInfo info) {
    int address = info.pattern_input.x;
    vec4[4] gradient = fetch_from_gpu_buffer_4f(address);
    ivec4 header = decode_gradient_header(address + 2, gradient[2]);

    vec2 pos = info.local_pos - info.local_prim_rect.p0;

    switch (header.x) {
        case GRADIENT_KIND_LINEAR: {
            linear_gradient_vertex(pos, gradient[0]);
            break;
        }
        case GRADIENT_KIND_RADIAL: {
            radial_gradient_vertex(pos, gradient[0], gradient[1]);
            break;
        }
        case GRADIENT_KIND_CONIC: {
            conic_gradient_vertex(pos, gradient[0], gradient[1]);
            break;
        }
        default: {
            // This should be dead code.
            v_interpolated_data = vec4(0.0);
            v_flat_data = vec4(0.0);
            break;
        }
    }

    v_gradient_header = header;
    v_stop_offsets = gradient[3];

    int count = header.y;
    if (count == 2) {
        // Fast path: If we have only two color stops, pass them by varyings.
        vec4[2] colors = fetch_from_gpu_buffer_2f(address + 4);
        v_color0 = colors[0];
        v_color1 = colors[1];
    }
}

#endif


#ifdef WR_FRAGMENT_SHADER

// TODO: hook up dithering. To do this:
// - Move the dithering code into its own file so that we can import
//   it here with a bunch of code and varyings we don't want.
// - Add a version of this shader in shade.rs with WR_FEATURE_DITHERING
vec4 dither(vec4 color) {
    return color;
}

// From https://math.stackexchange.com/questions/1098487/atan2-faster-approximation
float approx_atan2(float y, float x) {
    vec2 a = abs(vec2(x, y));
    float slope = min(a.x, a.y) / max(a.x, a.y);
    float s2 = slope * slope;
    float r = ((-0.0464964749 * s2 + 0.15931422) * s2 - 0.327622764) * s2 * slope + slope;

    r = if_then_else(float(a.y > a.x), 1.57079637 - r, r);
    r = if_then_else(float(x < 0.0),   3.14159274 - r, r);
    // To match atan2's behavior, -0.0 should count as negative and flip the sign of r.
    // Does this matter in practice in the context of conic gradients?
    r = y < 0.0 ? -r : r;

    return r;
}

float apply_extend_mode(float offset) {
    // Handle the repeat mode.
    float mode = float(v_gradient_header.y >> 24);
    offset -= floor(offset) * mode;

    return offset;
}
// Sample the gradient using a sequence of gradient stops located at the provided
// addresses.
//
// See the comment above `prim_store::gradient::write_gpu_gradient_stops` about
// the layout of the gradient data in the gpu buffer.
//
// This function expects that:
//  - Offset is between 0 and 1.
//  - Stop offsets are in increasing order.
vec4 sample_gradient_stops(float offset) {
    int count = v_gradient_header.y & 0x0FFFFFF;
    int addr = v_gradient_header.z;
    int colors_addr = v_gradient_header.w;

    // Index of the first gradient stop that is after
    // the current offset.
    int index = 0;

    // Loop over the gradient stop offsets by fetching them four at a time
    // until we find the pair of gradient stops that affect the current pixel.

    // Fetch the first offsets from varyings instead of reading them from the
    // the gpu bufer.
    vec4 stop_offsets = v_stop_offsets;
    float prev_stop_offset = stop_offsets.x;
    float stop_offset = stop_offsets.x;

    while (index < count) {
        prev_stop_offset = stop_offset;
        stop_offset = stop_offsets.x;
        if (stop_offset > offset) { break; }
        index += 1;

        prev_stop_offset = stop_offset;
        stop_offset = stop_offsets.y;
        if (stop_offset > offset) { break; }
        index += 1;

        prev_stop_offset = stop_offset;
        stop_offset = stop_offsets.z;
        if (stop_offset > offset) { break; }
        index += 1;

        prev_stop_offset = stop_offset;
        stop_offset = stop_offsets.w;
        if (stop_offset > offset) { break; }
        index += 1;

        addr += 1;
        if (index >= count) {
            // If we exit the loop through here, it means that there isn't a
            // gradient stop after the current offset. In this case we must
            // use the color of the last gradient stop. We do so by noticing
            // that the index is greater or equal to the stop count and set
            // the interpolation factor to 1.0.
            break;
        }

        stop_offsets = fetch_from_gpu_buffer_1f(addr);
    }

    int color_pair_address = colors_addr + min(max(1, index), count - 1) - 1;
    vec4 color_pair[2] = fetch_from_gpu_buffer_2f(color_pair_address);

    // If we are before the first gradient stop, stop_offset and prev_stop_offset
    // will be equal, in which case we want the contribution of the first stop, so
    // the interpolaiton factor remains zero.
    float d = stop_offset - prev_stop_offset;
    float factor = 0.0;
    if (index >= count) {
        // The current offset is after the last gradient stop.
        factor = 1.0;
    } else if (d > 0.0) {
        factor = clamp((offset - prev_stop_offset) / d, 0.0, 1.0);
    }

    // Interpolate and apply dithering.
    return dither(mix(color_pair[0], color_pair[1], factor));
}

// A fast path for sampling no more than two gradient stops.
//
// This version reads data from varyings instead of the gpu_buffer.
vec4 sample_gradient_stops_fast(float offset) {
    float d = v_stop_offsets.y - v_stop_offsets.x;
    float factor = 0.0;

    if (offset < v_stop_offsets.x) {
        factor = 0.0;
        d = 1.0;
    } else if (offset > v_stop_offsets.y) {
        factor = 1.0;
        d = 1.0;
    } else if (d > 0.0) {
        factor = clamp((offset - v_stop_offsets.x) / d, 0.0, 1.0);
    }

    return mix(v_color0, v_color1, factor);
}

float linear_gradient_fragment() {
    vec2 pos = v_interpolated_data.xy;
    vec2 scale_dir = v_flat_data.xy;
    float start_offset = v_flat_data.z;

    // Project position onto a direction vector to compute offset.
    return dot(pos, scale_dir) - start_offset;
}

float radial_gradient_fragment() {
    // Solve for t in length(pos) = start_radius + t * rd
    vec2 pos = v_interpolated_data.xy;
    float start_radius = v_flat_data.x;

    return length(pos) - start_radius;
}

float conic_gradient_fragment() {
    vec2 current_dir = v_interpolated_data.xy;
    float start_offset = v_interpolated_data.z;
    float offset_scale = v_interpolated_data.w;
    float angle = v_flat_data.x;

    float current_angle = approx_atan2(current_dir.y, current_dir.x) + angle;
    return fract(current_angle / (2.0 * PI)) * offset_scale - start_offset;
}

vec4 pattern_fragment(vec4 color) {

    float offset = 0.0;
    switch (v_gradient_header.x) {
        case GRADIENT_KIND_LINEAR: {
            offset = linear_gradient_fragment();
            break;
        }
        case GRADIENT_KIND_RADIAL: {
            offset = radial_gradient_fragment();
            break;
        }
        case GRADIENT_KIND_CONIC: {
            offset = conic_gradient_fragment();
            break;
        }
        default: {
            break;
        }
    }

    offset = apply_extend_mode(offset);

    int stop_count = v_gradient_header.y;
    if (stop_count <= 2) {
        color *= sample_gradient_stops_fast(offset);
    } else {
        color *= sample_gradient_stops(offset);
    }

    return color;
}

#if defined(SWGL_DRAW_SPAN)
void swgl_drawSpanRGBA8() {
    if (v_gradient_header.x != GRADIENT_KIND_RADIAL) {
        return;
    }

    int stop_count = v_gradient_header.y;
    int offsets_addr = swgl_validateGradient(sGpuBufferF, get_gpu_buffer_uv(v_gradient_header.z),
                                             stop_count);
    int colors_addr = swgl_validateGradient(sGpuBufferF, get_gpu_buffer_uv(v_gradient_header.w),
                                            stop_count);
    if (offsets_addr < 0 || colors_addr < 0) {
        return;
    }

    vec2 pos = v_interpolated_data.xy;
    float start_radius = v_flat_data.z;
    bool repeat = (v_gradient_header.y >> 24) != 0.0;

    swgl_commitRadialGradientFromStopsRGBA8(sGpuBufferF, offsets_addr, colors_addr,
                                            stop_count, repeat, pos, start_radius);
}
#endif

#endif
