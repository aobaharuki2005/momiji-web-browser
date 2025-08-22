/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HTMLEditor.h"

#include "EditAction.h"
#include "EditorUtils.h"
#include "HTMLEditorNestedClasses.h"

#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"
#include "mozilla/DebugOnly.h"
#include "mozilla/IMEStateManager.h"
#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/Element.h"
#include "mozInlineSpellChecker.h"
#include "nsContentUtils.h"
#include "nsIContent.h"
#include "nsIMutationObserver.h"
#include "nsINode.h"
#include "nsRange.h"
#include "nsThreadUtils.h"

namespace mozilla {

using namespace dom;

/******************************************************************************
 * mozilla::HTMLEditor - mutation observers/handlers
 ******************************************************************************/

void HTMLEditor::NotifyRootChanged() {
  MOZ_ASSERT(mPendingRootElementUpdatedRunner,
             "HTMLEditor::NotifyRootChanged() should be called via a runner");
  mPendingRootElementUpdatedRunner = nullptr;

  nsCOMPtr<nsIMutationObserver> kungFuDeathGrip(this);

  AutoEditActionDataSetter editActionData(*this, EditAction::eNotEditing);
  if (NS_WARN_IF(!editActionData.CanHandle())) {
    return;
  }

  RemoveEventListeners();
  nsresult rv = InstallEventListeners();
  if (NS_FAILED(rv)) {
    NS_WARNING("HTMLEditor::InstallEventListeners() failed, but ignored");
    return;
  }

  UpdateRootElement();

  if (MOZ_LIKELY(mRootElement)) {
    rv = MaybeCollapseSelectionAtFirstEditableNode(false);
    if (NS_FAILED(rv)) {
      NS_WARNING(
          "HTMLEditor::MaybeCollapseSelectionAtFirstEditableNode(false) "
          "failed, "
          "but ignored");
      return;
    }

    // When this editor has focus, we need to reset the selection limiter to
    // new root.  Otherwise, that is going to be done when this gets focus.
    nsCOMPtr<nsINode> node = GetFocusedNode();
    if (node) {
      DebugOnly<nsresult> rvIgnored = InitializeSelection(*node);
      NS_WARNING_ASSERTION(
          NS_SUCCEEDED(rvIgnored),
          "EditorBase::InitializeSelection() failed, but ignored");
    }

    SyncRealTimeSpell();
  }

  RefPtr<Element> newRootElement(mRootElement);
  IMEStateManager::OnUpdateHTMLEditorRootElement(*this, newRootElement);
}

// nsStubMutationObserver::ContentAppended override
MOZ_CAN_RUN_SCRIPT_BOUNDARY void HTMLEditor::ContentAppended(
    nsIContent* aFirstNewContent, const ContentAppendInfo&) {
  DoContentInserted(aFirstNewContent, ContentNodeIs::Appended);
}

// nsStubMutationObserver::ContentInserted override
MOZ_CAN_RUN_SCRIPT_BOUNDARY void HTMLEditor::ContentInserted(
    nsIContent* aChild, const ContentInsertInfo&) {
  DoContentInserted(aChild, ContentNodeIs::Inserted);
}

bool HTMLEditor::IsInObservedSubtree(nsIContent* aChild) {
  if (!aChild) {
    return false;
  }

  // FIXME(emilio, bug 1596856): This should probably work if the root is in the
  // same shadow tree as the child, probably? I don't know what the
  // contenteditable-in-shadow-dom situation is.
  if (Element* root = GetRoot()) {
    // To be super safe here, check both ChromeOnlyAccess and NAC / Shadow DOM.
    // That catches (also unbound) native anonymous content and ShadowDOM.
    if (root->ChromeOnlyAccess() != aChild->ChromeOnlyAccess() ||
        root->IsInNativeAnonymousSubtree() !=
            aChild->IsInNativeAnonymousSubtree() ||
        root->IsInShadowTree() != aChild->IsInShadowTree()) {
      return false;
    }
  }

  return !aChild->ChromeOnlyAccess() && !aChild->IsInShadowTree() &&
         !aChild->IsInNativeAnonymousSubtree();
}

bool HTMLEditor::ShouldReplaceRootElement() const {
  if (!mRootElement) {
    // If we don't know what is our root element, we should find our root.
    return true;
  }

  // If we temporary set document root element to mRootElement, but there is
  // body element now, we should replace the root element by the body element.
  return mRootElement != GetBodyElement();
}

void HTMLEditor::DoContentInserted(nsIContent* aChild,
                                   ContentNodeIs aContentNodeIs) {
  MOZ_ASSERT(aChild);
  nsINode* container = aChild->GetParentNode();
  MOZ_ASSERT(container);

  if (!IsInObservedSubtree(aChild)) {
    return;
  }

  // XXX Why do we need this? This method is a helper of mutation observer.
  //     So, the callers of mutation observer should guarantee that this won't
  //     be deleted at least during the call.
  RefPtr<HTMLEditor> kungFuDeathGrip(this);

  // Do not create AutoEditActionDataSetter here because it grabs `Selection`,
  // but that appear in the profile. If you need to create to it in some cases,
  // you should do it in the minimum scope.

  if (ShouldReplaceRootElement()) {
    // Forget maybe disconnected root element right now because nobody should
    // work with it.
    mRootElement = nullptr;
    if (mPendingRootElementUpdatedRunner) {
      return;
    }
    mPendingRootElementUpdatedRunner = NewRunnableMethod(
        "HTMLEditor::NotifyRootChanged", this, &HTMLEditor::NotifyRootChanged);
    nsContentUtils::AddScriptRunner(
        do_AddRef(mPendingRootElementUpdatedRunner));
    return;
  }

  // We don't need to handle our own modifications
  if (!GetTopLevelEditSubAction() && container->IsEditable()) {
    if (EditorUtils::IsPaddingBRElementForEmptyEditor(*aChild)) {
      // Ignore insertion of the padding <br> element.
      return;
    }
    nsresult rv = RunOrScheduleOnModifyDocument();
    if (NS_WARN_IF(rv == NS_ERROR_EDITOR_DESTROYED)) {
      return;
    }
    NS_WARNING_ASSERTION(
        NS_SUCCEEDED(rv),
        "HTMLEditor::RunOrScheduleOnModifyDocument() failed, but ignored");

    // Update spellcheck for only the newly-inserted node (bug 743819)
    if (mInlineSpellChecker) {
      nsIContent* endContent = aChild;
      if (aContentNodeIs == ContentNodeIs::Appended) {
        nsIContent* child = nullptr;
        for (child = aChild; child; child = child->GetNextSibling()) {
          if (child->InclusiveDescendantMayNeedSpellchecking(this)) {
            break;
          }
        }
        if (!child) {
          // No child needed spellchecking, return.
          return;
        }

        // Maybe more than 1 child was appended.
        endContent = container->GetLastChild();
      } else if (!aChild->InclusiveDescendantMayNeedSpellchecking(this)) {
        return;
      }

      RefPtr<nsRange> range = nsRange::Create(aChild);
      range->SelectNodesInContainer(container, aChild, endContent);
      DebugOnly<nsresult> rvIgnored =
          mInlineSpellChecker->SpellCheckRange(range);
      NS_WARNING_ASSERTION(
          rvIgnored == NS_ERROR_NOT_INITIALIZED || NS_SUCCEEDED(rvIgnored),
          "mozInlineSpellChecker::SpellCheckRange() failed, but ignored");
    }
  }
}

// nsStubMutationObserver::ContentWillBeRemoved override
MOZ_CAN_RUN_SCRIPT_BOUNDARY void HTMLEditor::ContentWillBeRemoved(
    nsIContent* aChild, const ContentRemoveInfo&) {
  if (mLastCollapsibleWhiteSpaceAppendedTextNode == aChild) {
    mLastCollapsibleWhiteSpaceAppendedTextNode = nullptr;
  }

  if (!IsInObservedSubtree(aChild)) {
    return;
  }

  // XXX Why do we need to do this?  This method is a mutation observer's
  //     method.  Therefore, the caller should guarantee that this won't be
  //     deleted during the call.
  RefPtr<HTMLEditor> kungFuDeathGrip(this);

  // Do not create AutoEditActionDataSetter here because it grabs `Selection`,
  // but that appear in the profile. If you need to create to it in some cases,
  // you should do it in the minimum scope.

  // FYI: mRootElement may be the <body> of the document or the root element.
  // Therefore, we don't need to check it across shadow DOM boundaries.
  if (mRootElement && mRootElement->IsInclusiveDescendantOf(aChild)) {
    // Forget the disconnected root element right now because nobody should work
    // with it.
    mRootElement = nullptr;
    if (mPendingRootElementUpdatedRunner) {
      return;
    }
    mPendingRootElementUpdatedRunner = NewRunnableMethod(
        "HTMLEditor::NotifyRootChanged", this, &HTMLEditor::NotifyRootChanged);
    nsContentUtils::AddScriptRunner(
        do_AddRef(mPendingRootElementUpdatedRunner));
    return;
  }

  // We don't need to handle our own modifications
  if (!GetTopLevelEditSubAction() && aChild->GetParentNode()->IsEditable()) {
    if (aChild && EditorUtils::IsPaddingBRElementForEmptyEditor(*aChild)) {
      // Ignore removal of the padding <br> element for empty editor.
      return;
    }

    nsresult rv = RunOrScheduleOnModifyDocument(aChild);
    if (NS_WARN_IF(rv == NS_ERROR_EDITOR_DESTROYED)) {
      return;
    }
    NS_WARNING_ASSERTION(
        NS_SUCCEEDED(rv),
        "HTMLEditor::RunOrScheduleOnModifyDocument() failed, but ignored");
  }
}

// nsStubMutationObserver::CharacterDataChanged override
MOZ_CAN_RUN_SCRIPT_BOUNDARY void HTMLEditor::CharacterDataChanged(
    nsIContent* aContent, const CharacterDataChangeInfo& aInfo) {
  if (!mInlineSpellChecker || !aContent->IsEditable() ||
      !IsInObservedSubtree(aContent) ||
      GetTopLevelEditSubAction() != EditSubAction::eNone) {
    return;
  }

  nsIContent* parent = aContent->GetParent();
  if (!parent || !parent->InclusiveDescendantMayNeedSpellchecking(this)) {
    return;
  }

  RefPtr<nsRange> range = nsRange::Create(aContent);
  range->SelectNodesInContainer(parent, aContent, aContent);
  DebugOnly<nsresult> rvIgnored = mInlineSpellChecker->SpellCheckRange(range);
}

nsresult HTMLEditor::RunOrScheduleOnModifyDocument(
    const nsIContent* aContentWillBeRemoved /* = nullptr */) {
  if (mPendingDocumentModifiedRunner) {
    return NS_OK;  // We've already posted same runnable into the queue.
  }
  mPendingDocumentModifiedRunner = new DocumentModifiedEvent(*this);
  nsContentUtils::AddScriptRunner(do_AddRef(mPendingDocumentModifiedRunner));
  // Be aware, if OnModifyDocument() may be called synchronously, the
  // editor might have been destroyed here.
  return NS_WARN_IF(Destroyed()) ? NS_ERROR_EDITOR_DESTROYED : NS_OK;
}

nsresult HTMLEditor::OnModifyDocument(const DocumentModifiedEvent& aRunner) {
  MOZ_ASSERT(mPendingDocumentModifiedRunner,
             "HTMLEditor::OnModifyDocument() should be called via a runner");
  MOZ_ASSERT(&aRunner == mPendingDocumentModifiedRunner);
  mPendingDocumentModifiedRunner = nullptr;

  Maybe<AutoEditActionDataSetter> editActionData;
  if (!IsEditActionDataAvailable()) {
    editActionData.emplace(*this,
                           EditAction::eCreatePaddingBRElementForEmptyEditor);
    if (NS_WARN_IF(!editActionData->CanHandle())) {
      return NS_ERROR_NOT_AVAILABLE;
    }
  }

  // EnsureNoPaddingBRElementForEmptyEditor() below may cause a flush, which
  // could destroy the editor
  nsAutoScriptBlockerSuppressNodeRemoved scriptBlocker;

  // Delete our padding <br> element for empty editor, if we have one, since
  // the document might not be empty any more.
  nsresult rv = EnsureNoPaddingBRElementForEmptyEditor();
  if (NS_WARN_IF(rv == NS_ERROR_EDITOR_DESTROYED)) {
    return rv;
  }
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                       "EditorBase::EnsureNoPaddingBRElementForEmptyEditor() "
                       "failed, but ignored");

  // Try to recreate the padding <br> element for empty editor if needed.
  rv = MaybeCreatePaddingBRElementForEmptyEditor();
  if (NS_WARN_IF(rv == NS_ERROR_EDITOR_DESTROYED)) {
    return NS_ERROR_EDITOR_DESTROYED;
  }
  NS_WARNING_ASSERTION(
      NS_SUCCEEDED(rv),
      "EditorBase::MaybeCreatePaddingBRElementForEmptyEditor() failed");

  return rv;
}

}  // namespace mozilla
