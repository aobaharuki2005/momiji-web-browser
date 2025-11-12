/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsViewManager_h___
#define nsViewManager_h___

#include "nscore.h"
#include "nsView.h"
#include "nsCOMPtr.h"
#include "nsCRT.h"
#include "nsTArray.h"
#include "nsTArray.h"
#include "mozilla/Attributes.h"
#include "mozilla/EventForwards.h"

class nsIWidget;
struct nsRect;
class nsRegion;

namespace mozilla {
class PresShell;
}  // namespace mozilla

class nsViewManager final {
  ~nsViewManager();

 public:
  friend class nsView;

  typedef mozilla::LayoutDeviceIntRect LayoutDeviceIntRect;
  typedef mozilla::LayoutDeviceIntRegion LayoutDeviceIntRegion;

  NS_INLINE_DECL_REFCOUNTING(nsViewManager)

  nsViewManager();

  /**
   * Initialize the ViewManager
   * Note: this instance does not hold a reference to the presshell
   * because it holds a reference to this instance.
   * @result The result of the initialization, NS_OK if no errors
   */
  nsresult Init();

  /**
   * Create an ordinary view
   * @param aSize initial size for view
   *        XXX We should eliminate this parameter; you can set the bounds
   *        after CreateView
   * @result The new view.  Never null.
   */
  nsView* CreateView(const nsSize& aSize);

  /**
   * Get the root of the view tree.
   * @result the root view
   */
  nsView* GetRootView() { return mRootView; }

  /**
   * Set the root of the view tree. Does not destroy the current root view.
   * aView may have a parent view managed by a different view manager.
   * aView may have a widget (anything but printing) or may not (printing).
   * @param aView view to set as root
   */
  void SetRootView(nsView* aView);

  /**
   * Get the dimensions of the root window. The dimensions are in
   * twips
   * @param aWidth out parameter for width of window in twips
   * @param aHeight out parameter for height of window in twips
   */
  void GetWindowDimensions(nscoord* aWidth, nscoord* aHeight);

  /**
   * Set the dimensions of the root window.
   * Called if the root window is resized. The dimensions are in
   * twips
   * @param aWidth of window in twips
   * @param aHeight of window in twips
   */
  void SetWindowDimensions(nscoord aWidth, nscoord aHeight,
                           bool aDelayResize = false);

  /**
   * Do any resizes that are pending.
   */
  void FlushDelayedResize();

  /**
   * Called to dispatch an event to the appropriate view. Often called
   * as a result of receiving a mouse or keyboard event from the widget
   * event system.
   * @param aEvent event to dispatch
   * @param aViewTarget dispatch the event to this view
   * @param aStatus event handling status
   */
  MOZ_CAN_RUN_SCRIPT
  void DispatchEvent(mozilla::WidgetGUIEvent* aEvent, nsView* aViewTarget,
                     nsEventStatus* aStatus);

  /**
   * Resize a view. In addition to setting the width and height, you can
   * set the x and y of its bounds relative to its position. Negative x and y
   * will let the view extend above and to the left of the (0,0) point in its
   * coordinate system.
   * The view manager generates the appropriate dirty regions.
   * @param aView view to move
   * @param the new bounds relative to the current position
   */
  void ResizeView(nsView* aView, const nsRect& aRect);

  /**
   * Set the presshell associated with this manager
   * @param aPresShell - new presshell
   */
  void SetPresShell(mozilla::PresShell* aPresShell) { mPresShell = aPresShell; }

  /**
   * Get the pres shell associated with this manager
   */
  mozilla::PresShell* GetPresShell() const { return mPresShell; }

 public:
  /**
   * Indicate whether the viewmanager is currently painting
   *
   * @param aPainting true if the viewmanager is painting
   *                  false otherwise
   */
  void IsPainting(bool& aIsPainting);

  /**
   * Retrieve the time of the last user event. User events
   * include mouse and keyboard events. The viewmanager
   * saves the time of the last user event.
   */
  static uint32_t GetLastUserEventTime() { return gLastUserEventTime; }

  /**
   * Flush the accumulated dirty region to the widget and update widget
   * geometry.
   */
  MOZ_CAN_RUN_SCRIPT void ProcessPendingUpdates();

  /**
   * Just update widget geometry without flushing the dirty region
   */
  MOZ_CAN_RUN_SCRIPT void UpdateWidgetGeometry();

 private:
  static uint32_t gLastUserEventTime;

  void FlushPendingInvalidates();

  MOZ_CAN_RUN_SCRIPT
  void ProcessPendingUpdatesForView(nsView* aView,
                                    bool aFlushDirtyRegion = true);
  void ProcessPendingUpdatesRecurse(
      nsView* aView, AutoTArray<nsCOMPtr<nsIWidget>, 1>& aWidgets);
  MOZ_CAN_RUN_SCRIPT
  void ProcessPendingUpdatesPaint(nsIWidget* aWidget);

  /**
   * Call WillPaint() on all view observers under this vm root.
   */
  MOZ_CAN_RUN_SCRIPT_BOUNDARY void CallWillPaintOnObservers();
  static void CollectVMsForWillPaint(nsView* aView, nsViewManager* aParentVM,
                                     nsTArray<RefPtr<nsViewManager>>& aVMs);

  // aView is the view for aWidget and aRegion is relative to aWidget.
  MOZ_CAN_RUN_SCRIPT
  void Refresh(nsView* aView, const LayoutDeviceIntRegion& aRegion);

  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  void DoSetWindowDimensions(nscoord aWidth, nscoord aHeight);
  bool ShouldDelayResize() const;

  bool IsPainting() const { return RootViewManager()->mPainting; }

  void SetPainting(bool aPainting) { RootViewManager()->mPainting = aPainting; }

  nsViewManager* RootViewManager() const;
  nsViewManager* GetParentViewManager() const;
  bool IsRootVM() const { return !GetParentViewManager(); }

  MOZ_CAN_RUN_SCRIPT void WillPaintWindow(nsIWidget* aWidget);
  MOZ_CAN_RUN_SCRIPT
  bool PaintWindow(nsIWidget* aWidget, const LayoutDeviceIntRegion& aRegion);
  MOZ_CAN_RUN_SCRIPT void DidPaintWindow();

  // Call this when you need to let the viewmanager know that it now has
  // pending updates.
  void PostPendingUpdate();

  mozilla::PresShell* mPresShell;

  // The size for a resize that we delayed until the root view becomes
  // visible again.
  nsSize mDelayedResize;

  nsView* mRootView;

  // The following members should not be accessed directly except by
  // the root view manager.  Some have accessor functions to enforce
  // this, as noted.
  // Use IsPainting() and SetPainting() to access mPainting.
  bool mPainting;
  bool mHasPendingWidgetGeometryChanges;

  // from here to public should be static and locked... MMP
};

/**
   Invalidation model:

   1) Callers call into the view manager and ask it to invalidate a view.

   2) The view manager finds the "right" widget for the view, henceforth called
      the root widget.

   3) The view manager traverses descendants of the root widget and for each
      one that needs invalidation stores the rect to invalidate on the widget's
      view (batching).

   4) The dirty region is flushed to the right widget when
      ProcessPendingUpdates is called from the RefreshDriver.

   It's important to note that widgets associated to views outside this view
   manager can end up being invalidated during step 3.  Therefore, the end of a
   view update batch really needs to traverse the entire view tree, to ensure
   that those invalidates happen.

   To cope with this, invalidation processing and should only happen on the
   root viewmanager.
*/

#endif  // nsViewManager_h___
