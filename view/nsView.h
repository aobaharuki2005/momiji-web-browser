/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsView_h__
#define nsView_h__

#include "nsCoord.h"
#include "nsRect.h"
#include "nsPoint.h"
#include "nsRegion.h"
#include "nsCRT.h"
#include "nsCOMPtr.h"
#include "nsIWidgetListener.h"
#include "Units.h"
#include "mozilla/Attributes.h"
#include "mozilla/CallState.h"
#include "mozilla/EventForwards.h"

class nsViewManager;
class nsIWidget;
class nsIFrame;

namespace mozilla {
class PresShell;
namespace dom {
class BrowserParent;
}  // namespace dom
namespace widget {
struct InitData;
enum class TransparencyMode : uint8_t;
enum class WindowType : uint8_t;
}  // namespace widget
}  // namespace mozilla

/**
 * nsView's serve two main purposes: 1) a bridge between nsIFrame's and
 * nsIWidget's, 2) linking the frame tree of a(n) (in-process) subdocument with
 * its parent document frame tree. Historically views were used for more things,
 * but their role has been reduced, and could be reduced to nothing in the
 * future (bug 337801 tracks removing views). Views are generally associated
 * with a frame. A view that does not have a frame is called an anonymous view.
 * Some frames also have associated widgets (think os level windows). If a frame
 * has a widget it must also have a view, but not all frames with views will
 * have widgets.
 *
 * Only four types of frames can have a view: root frames (ViewportFrame),
 * subdocument frames (nsSubDocumentFrame),
 * menu popup frames (nsMenuPopupFrame), and list control frames
 * (nsListControlFrame). Root frames and subdocument frames have views to link
 * the two documents together (the frame trees do not link up otherwise).
 * Menu popup frames, and list control frames have views because
 * they (sometimes) need to create widgets.
 * Menu popup frames handles xul popups, which is anything
 * where we need content to go over top the main window at an os level. List
 * control frames handle select popups/dropdowns in non-e10s mode.
 *
 * The term "root view" refers to the root view of a document. Just like root
 * frames, root views can have parent views. Only the root view of the root
 * document in the process will not have a parent.
 *
 * All views are created by their frames except root views. Root views are
 * special. Root views are created in nsDocumentViewer::MakeWindow before the
 * root frame is created, so the root view will not have a frame very early in
 * document creation.
 *
 * Subdocument frames have an anonymous (no frame associated
 * with it) inner view that is a child of their "outer" view.
 *
 * On a subdocument frame the inner view serves as the parent of the
 * root view of the subdocument. The outer and inner view of the subdocument
 * frame belong to the subdocument frame and hence to the parent document. The
 * root view of the subdocument belongs to the subdocument.
 * nsLayoutUtils::GetCrossDocParentFrame and nsPresContext::GetParentPresContext
 * depend on this view structure and are the main way that we traverse across
 * the document boundary in layout.
 *
 * When the load of a new document is started in the subdocument, the creation
 * of the new subdocument and destruction of the old subdocument are not
 * linked. (This creation and destruction is handled in nsDocumentViewer.cpp.)
 * This means that the old and new document will both exist at the same time
 * during the loading of the new document. During this period the inner view of
 * the subdocument parent will be the parent of two root views. This means that
 * during this period there is a choice for which subdocument we draw,
 * nsSubDocumentFrame::GetSubdocumentPresShellForPainting is what makes that
 * choice. Note that this might not be a totally free choice, ie there might be
 * hidden dependencies and bugs if the way we choose is changed.
 *
 * One thing that is special about the root view of a chrome window is that
 * instead of creating a widget for the view, they can "attach" to the
 * existing widget that was created by appshell code or something else. (see
 * nsDocumentViewer::ShouldAttachToTopLevel)
 */

//----------------------------------------------------------------------

/**
 * View interface
 *
 * Views are NOT reference counted. Use the Destroy() member function to
 * destroy a view.
 *
 * The lifetime of the view hierarchy is bounded by the lifetime of the
 * view manager that owns the views.
 *
 * Most of the methods here are read-only. To set the corresponding properties
 * of a view, go through nsViewManager.
 */

class nsView final : public nsIWidgetListener {
 public:
  friend class nsViewManager;

  typedef mozilla::LayoutDeviceIntRect LayoutDeviceIntRect;
  typedef mozilla::LayoutDeviceIntRegion LayoutDeviceIntRegion;

  void operator delete(void* ptr) { ::operator delete(ptr); }

  /**
   * Get the view manager which "owns" the view.
   * This method might require some expensive traversal work in the future. If
   * you can get the view manager from somewhere else, do that instead.
   * @result the view manager
   */
  nsViewManager* GetViewManager() const { return mViewManager; }

  /**
   * Destroy the view.
   *
   * The view destroys its child views, and destroys and releases its
   * widget (if it has one).
   *
   * Also informs the view manager that the view is destroyed by calling
   * SetRootView(NULL) if the view is the root view and calling RemoveChild()
   * otherwise.
   */
  void Destroy();

  /**
   * Called to get the size of the view.
   */
  nsSize GetSize() const { return mSize; }

  /**
   * Destroys the associated widget for this view.  If this method is
   * not called explicitly, the widget when be destroyed when its
   * view gets destroyed.
   */
  void DestroyWidget();

  /**
   * Attach/detach a top level widget from this view. When attached, the view
   * updates the widget's device context and allows the view to begin receiving
   * gecko events. The underlying base window associated with the widget will
   * continues to receive events it expects.
   *
   * An attached widget will not be destroyed when the view is destroyed,
   * allowing the recycling of a single top level widget over multiple views.
   *
   * @param aWidget The widget to attach to / detach from.
   */
  void AttachToTopLevelWidget(nsIWidget* aWidget);
  void DetachFromTopLevelWidget();

  /**
   * In 4.0, the "cutout" nature of a view is queryable.
   * If we believe that all cutout view have a native widget, this
   * could be a replacement.
   * @param aWidget out parameter for widget that this view contains,
   *        or nullptr if there is none.
   */
  nsIWidget* GetWidget() const { return mWindow; }

  /**
   * Returns true if the view has a widget associated with it.
   */
  bool HasWidget() const { return mWindow != nullptr; }

  void SetForcedRepaint(bool aForceRepaint) { mForcedRepaint = aForceRepaint; }

  void SetNeedsWindowPropertiesSync();

#ifdef DEBUG
  /**
   * Output debug info to FILE
   * @param out output file handle
   * @param aIndent indentation depth
   * NOTE: virtual so that debugging tools not linked into gklayout can access
   * it
   */
  virtual void List(FILE* out, int32_t aIndent = 0) const;
#endif  // DEBUG

  // nsIWidgetListener
  mozilla::PresShell* GetPresShell() override;
  nsView* GetView() override { return this; }
  bool IsPaintSuppressed() const override {
    return IsPrimaryFramePaintSuppressed();
  }
  bool WindowResized(nsIWidget* aWidget, int32_t aWidth,
                     int32_t aHeight) override;
#ifdef MOZ_WIDGET_ANDROID
  void DynamicToolbarMaxHeightChanged(mozilla::ScreenIntCoord aHeight) override;
  void DynamicToolbarOffsetChanged(mozilla::ScreenIntCoord aOffset) override;
  void KeyboardHeightChanged(mozilla::ScreenIntCoord aHeight) override;
  void AndroidPipModeChanged(bool) override;
#endif
  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  void WillPaintWindow(nsIWidget* aWidget) override;
  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  bool PaintWindow(nsIWidget* aWidget, LayoutDeviceIntRegion aRegion) override;
  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  void DidPaintWindow() override;
  void DidCompositeWindow(mozilla::layers::TransactionId aTransactionId,
                          const mozilla::TimeStamp& aCompositeStart,
                          const mozilla::TimeStamp& aCompositeEnd) override;
  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  nsEventStatus HandleEvent(mozilla::WidgetGUIEvent*) override;
  void SafeAreaInsetsChanged(const mozilla::LayoutDeviceIntMargin&) override;

  virtual ~nsView();

  bool IsPrimaryFramePaintSuppressed() const;

 private:
  explicit nsView(nsViewManager* = nullptr);

  bool ForcedRepaint() { return mForcedRepaint; }

  void SetSize(const nsSize& aSize) { mSize = aSize; }

  void CallOnAllRemoteChildren(
      const std::function<mozilla::CallState(mozilla::dom::BrowserParent*)>&
          aCallback);

  nsViewManager* mViewManager;
  nsCOMPtr<nsIWidget> mWindow;
  nsCOMPtr<nsIWidget> mPreviousWindow;
  nsSize mSize;
  bool mForcedRepaint;
  bool mIsDirty = false;
};

#endif
