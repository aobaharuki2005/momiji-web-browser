/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _include_mozilla_gfx_ipc_CompositorSession_h_
#define _include_mozilla_gfx_ipc_CompositorSession_h_

#include "base/basictypes.h"
#include "mozilla/layers/LayersTypes.h"
#include "mozilla/layers/CompositorTypes.h"
#include "nsISupportsImpl.h"

class nsIWidget;

namespace mozilla {
namespace widget {
class CompositorWidget;
class CompositorWidgetDelegate;
}  // namespace widget
namespace gfx {
class GPUProcessHost;
class GPUProcessManager;
}  // namespace gfx
namespace layers {

class GeckoContentController;
class IAPZCTreeManager;
class CompositorBridgeParent;
class CompositorBridgeChild;
class ClientLayerManager;
class UiCompositorControllerChild;

// A CompositorSession provides access to a compositor without exposing whether
// or not it's in-process or out-of-process.
class CompositorSession {
  friend class gfx::GPUProcessManager;

 protected:
  typedef gfx::GPUProcessHost GPUProcessHost;
  typedef widget::CompositorWidget CompositorWidget;
  typedef widget::CompositorWidgetDelegate CompositorWidgetDelegate;

 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(CompositorSession)

  virtual void Shutdown() = 0;

  // This returns a CompositorBridgeParent if the compositor resides in the same
  // process.
  virtual CompositorBridgeParent* GetInProcessBridge() const = 0;

  // Set the GeckoContentController for the root of the layer tree.
  virtual void SetContentController(GeckoContentController* aController) = 0;

  // Return the Async Pan/Zoom Tree Manager for this compositor.
  virtual RefPtr<IAPZCTreeManager> GetAPZCTreeManager() const = 0;

  // Return the child end of the compositor IPC bridge.
  CompositorBridgeChild* GetCompositorBridgeChild();

  // Return the proxy for accessing the compositor's widget.
  CompositorWidgetDelegate* GetCompositorWidgetDelegate() {
    return mCompositorWidgetDelegate;
  }

  // Return the id of the root layer tree.
  LayersId RootLayerTreeId() const { return mRootLayerTreeId; }

#if defined(MOZ_WIDGET_ANDROID)
  RefPtr<UiCompositorControllerChild> GetUiCompositorControllerChild() const;
#endif  // defined(MOZ_WIDGET_ANDROID)
 protected:
  CompositorSession(nsIWidget* aWidget, CompositorWidgetDelegate* aDelegate,
                    CompositorBridgeChild* aChild,
                    UiCompositorControllerChild* aUiController,
                    const LayersId& aRootLayerTreeId);
  virtual ~CompositorSession();

 protected:
  nsIWidget* mWidget;
  CompositorWidgetDelegate* mCompositorWidgetDelegate;
  RefPtr<CompositorBridgeChild> mCompositorBridgeChild;
  RefPtr<UiCompositorControllerChild> mUiCompositorControllerChild;
  LayersId mRootLayerTreeId;

 private:
  DISALLOW_COPY_AND_ASSIGN(CompositorSession);
};

}  // namespace layers
}  // namespace mozilla

#endif  // _include_mozilla_gfx_ipc_CompositorSession_h_
