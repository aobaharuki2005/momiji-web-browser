/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PrintTargetWindows.h"

#include "cairo-win32.h"
#include "mozilla/gfx/HelpersCairo.h"
#include "mozilla/StaticPrefs_browser.h"
#include "nsCoord.h"
#include "nsIContentAnalysis.h"
#include "nsString.h"

namespace mozilla {
namespace gfx {

PrintTargetWindows::PrintTargetWindows(cairo_surface_t* aCairoSurface,
                                       const IntSize& aSize, HDC aDC)
    : PrintTarget(aCairoSurface, aSize), mDC(aDC) {
  // TODO: At least add basic memory reporting.
  // 4 * mSize.width * mSize.height + sizeof(PrintTargetWindows) ?
}

/* static */
already_AddRefed<PrintTargetWindows> PrintTargetWindows::CreateOrNull(HDC aDC) {
  // Figure out the paper size, the actual surface size will be the printable
  // area which is likely smaller, but the size here is later used to create the
  // draw target where the full page size is needed.
  // Note: we only scale the printing using the LOGPIXELSY,
  // so we use that when calculating the surface width as well as the height.
  int32_t heightDPI = ::GetDeviceCaps(aDC, LOGPIXELSY);
  float width =
      (::GetDeviceCaps(aDC, PHYSICALWIDTH) * POINTS_PER_INCH_FLOAT) / heightDPI;
  float height =
      (::GetDeviceCaps(aDC, PHYSICALHEIGHT) * POINTS_PER_INCH_FLOAT) /
      heightDPI;
  IntSize size = IntSize::Truncate(width, height);

  if (!Factory::CheckSurfaceSize(size)) {
    return nullptr;
  }

  cairo_surface_t* surface = cairo_win32_printing_surface_create(aDC);

  if (cairo_surface_status(surface)) {
    return nullptr;
  }

  // The new object takes ownership of our surface reference.
  RefPtr<PrintTargetWindows> target =
      new PrintTargetWindows(surface, size, aDC);

  return target.forget();
}

nsresult PrintTargetWindows::BeginPrinting(const nsAString& aTitle,
                                           const nsAString& aPrintToFileName,
                                           int32_t aStartPage,
                                           int32_t aEndPage) {
  const uint32_t DOC_TITLE_LENGTH = MAX_PATH - 1;

  DOCINFOW docinfo;

  nsString titleStr(aTitle);
  if (titleStr.Length() > DOC_TITLE_LENGTH) {
    titleStr.SetLength(DOC_TITLE_LENGTH - 3);
    titleStr.AppendLiteral("...");
  }

  nsString docName(aPrintToFileName);
  docinfo.cbSize = sizeof(docinfo);
  docinfo.lpszDocName =
      titleStr.Length() > 0 ? titleStr.get() : L"Mozilla Document";
  docinfo.lpszOutput = docName.Length() > 0 ? docName.get() : nullptr;
  docinfo.lpszDatatype = nullptr;
  docinfo.fwType = 0;

  // StartDocW has a bug where it abandons the operation if we lose focus
  // before it presents a file dialog in print-to-file cases.  This happens
  // in some cases where a connected content-analysis agent presents a
  // dialog about the print permission *before* StartDocW can open its
  // file dialog.  We prevent applications (but not the user) from interfering
  // with window activation until the print job is submitted.  See bug 1980225.
  // This is currently gated on a pref which should be removed if this is kept.
  bool lockSfw =
      StaticPrefs::
          browser_contentanalysis_windows_lock_foreground_window_on_print() &&
      nsIContentAnalysis::MightBeActive();
  if (lockSfw) {
    ::LockSetForegroundWindow(LSFW_LOCK);
  }
  // If the user selected Microsoft Print to PDF or XPS Document Printer, then
  // the following StartDoc call will put up a dialog window to prompt the
  // user to provide the name and location of the file to be saved.  A zero or
  // negative return value indicates failure.  In that case we want to check
  // whether that is because the user hit Cancel, since we want to treat that
  // specially to avoid notifying the user that the print "failed" in that
  // case.
  // XXX We should perhaps introduce a new NS_ERROR_USER_CANCELLED errer.
  int result = ::StartDocW(mDC, &docinfo);
  if (lockSfw) {
    ::LockSetForegroundWindow(LSFW_UNLOCK);
  }

  if (result <= 0) {
    if (::GetLastError() == ERROR_CANCELLED) {
      return NS_ERROR_ABORT;
    }
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

nsresult PrintTargetWindows::EndPrinting() {
  int result = ::EndDoc(mDC);
  return (result <= 0) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult PrintTargetWindows::AbortPrinting() {
  PrintTarget::AbortPrinting();
  int result = ::AbortDoc(mDC);
  return (result <= 0) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult PrintTargetWindows::BeginPage(const IntSize& aSizeInPoints) {
  MOZ_ALWAYS_SUCCEEDS(PrintTarget::BeginPage(aSizeInPoints));
  int result = ::StartPage(mDC);
  return (result <= 0) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult PrintTargetWindows::EndPage() {
  cairo_surface_show_page(mCairoSurface);
  bool cairoFailure = cairo_surface_status(mCairoSurface);
  MOZ_ALWAYS_SUCCEEDS(PrintTarget::EndPage());
  int result = ::EndPage(mDC);
  return (result <= 0 || cairoFailure) ? NS_ERROR_FAILURE : NS_OK;
}

}  // namespace gfx
}  // namespace mozilla
