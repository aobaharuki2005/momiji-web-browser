/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AccIterator.h"

#include "AccGroupInfo.h"
#include "ARIAMap.h"
#include "DocAccessible-inl.h"
#include "LocalAccessible-inl.h"
#include "nsAccUtils.h"
#include "XULTreeAccessible.h"

#include "mozilla/a11y/DocAccessibleParent.h"
#include "mozilla/dom/DocumentOrShadowRoot.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/ElementInternals.h"
#include "mozilla/dom/HTMLLabelElement.h"
#include "mozilla/dom/TreeOrderedArrayInlines.h"

using namespace mozilla;
using namespace mozilla::a11y;

////////////////////////////////////////////////////////////////////////////////
// AccIterator
////////////////////////////////////////////////////////////////////////////////

AccIterator::AccIterator(const LocalAccessible* aAccessible,
                         filters::FilterFuncPtr aFilterFunc)
    : mFilterFunc(aFilterFunc) {
  mState = new IteratorState(aAccessible);
}

AccIterator::~AccIterator() {
  while (mState) {
    IteratorState* tmp = mState;
    mState = tmp->mParentState;
    delete tmp;
  }
}

LocalAccessible* AccIterator::Next() {
  while (mState) {
    LocalAccessible* child = mState->mParent->LocalChildAt(mState->mIndex++);
    if (!child) {
      IteratorState* tmp = mState;
      mState = mState->mParentState;
      delete tmp;

      continue;
    }

    uint32_t result = mFilterFunc(child);
    if (result & filters::eMatch) return child;

    if (!(result & filters::eSkipSubtree)) {
      IteratorState* childState = new IteratorState(child, mState);
      mState = childState;
    }
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// nsAccIterator::IteratorState

AccIterator::IteratorState::IteratorState(const LocalAccessible* aParent,
                                          IteratorState* mParentState)
    : mParent(aParent), mIndex(0), mParentState(mParentState) {}

////////////////////////////////////////////////////////////////////////////////
// RelatedAccIterator
////////////////////////////////////////////////////////////////////////////////

RelatedAccIterator::RelatedAccIterator(DocAccessible* aDocument,
                                       nsIContent* aDependentContent,
                                       nsAtom* aRelAttr)
    : mDocument(aDocument),
      mDependentContent(aDependentContent),
      mRelAttr(aRelAttr) {}

void RelatedAccIterator::Initialize() {
  nsIContent* content = mDependentContent;
  dom::DocumentOrShadowRoot* root =
      content->GetUncomposedDocOrConnectedShadowRoot();

  while (root) {
    if (nsAtom* id = content->GetID()) {
      DocAccessible::AttrRelProviders* idProviders =
          mDocument->GetRelProviders(content->AsElement(), id);

      if (idProviders) {
        for (auto& provider : *idProviders) {
          if (mRelAttr && provider->mRelAttr != mRelAttr) {
            continue;
          }

          mRelatedNodes.Insert(*provider->mContent);
        }
      }
    }
    if (auto result = mDocument->mDependentElementsMap.Lookup(content)) {
      DocAccessible::AttrRelProviders* elementProviders = &result.Data();
      if (elementProviders) {
        for (auto& provider : *elementProviders) {
          if (mRelAttr && provider->mRelAttr != mRelAttr) {
            continue;
          }

          if (nsCoreUtils::IsDescendantOfAnyShadowIncludingAncestor(
                  content, provider->mContent)) {
            mRelatedNodes.Insert(*provider->mContent);
          }
        }
      }
    }
    dom::ShadowRoot* shadow = content->GetContainingShadow();
    dom::Element* element =
        content->IsElement() ? content->AsElement() : nullptr;
    if (shadow && element && element == shadow->GetReferenceTargetElement()) {
      content = shadow->Host();
      root = content->GetUncomposedDocOrConnectedShadowRoot();
    } else {
      root = nullptr;
    }
  }

  mInitialized = true;
}

LocalAccessible* RelatedAccIterator::Next() {
  if (!mInitialized) {
    Initialize();
  }

  while (mNextIndex < mRelatedNodes.Length()) {
    nsIContent* nextContent = mRelatedNodes[mNextIndex];
    mNextIndex++;

    LocalAccessible* next = mDocument->GetAccessible(nextContent);
    if (next) {
      return next;
    }

    if (nextContent == mDocument->GetContent()) {
      return mDocument;
    }
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// HTMLLabelIterator
////////////////////////////////////////////////////////////////////////////////

HTMLLabelIterator::HTMLLabelIterator(DocAccessible* aDocument,
                                     const LocalAccessible* aAccessible,
                                     LabelFilter aFilter)
    : mRelIter(aDocument, aAccessible->GetContent(), nsGkAtoms::_for),
      mAcc(aAccessible),
      mLabelFilter(aFilter) {}

bool HTMLLabelIterator::IsLabel(LocalAccessible* aLabel) {
  dom::HTMLLabelElement* labelEl =
      dom::HTMLLabelElement::FromNode(aLabel->GetContent());
  return labelEl && labelEl->GetLabeledElementInternal() == mAcc->GetContent();
}

LocalAccessible* HTMLLabelIterator::Next() {
  // Get either <label for="[id]"> element which explicitly points to given
  // element, or <label> ancestor which implicitly point to it.
  LocalAccessible* label = nullptr;
  while ((label = mRelIter.Next())) {
    if (IsLabel(label)) {
      return label;
    }
  }

  // Ignore ancestor label on not widget accessible.
  if (mLabelFilter == eSkipAncestorLabel) {
    return nullptr;
  }

  if (!mAcc->IsWidget()) {
    nsIContent* content = mAcc->GetContent();
    if (!content->IsElement()) {
      return nullptr;
    }
    dom::Element* element = content->AsElement();
    // <output> is not a widget but is labelable.
    if (!element->IsLabelable()) {
      return nullptr;
    }
  }

  // Go up tree to get a name of ancestor label if there is one (an ancestor
  // <label> implicitly points to us). Don't go up farther than form or
  // document.
  LocalAccessible* walkUp = mAcc->LocalParent();
  while (walkUp && !walkUp->IsDoc()) {
    nsIContent* walkUpEl = walkUp->GetContent();
    if (IsLabel(walkUp) && !walkUpEl->AsElement()->HasAttr(nsGkAtoms::_for)) {
      mLabelFilter = eSkipAncestorLabel;  // prevent infinite loop
      return walkUp;
    }

    if (walkUpEl->IsHTMLElement(nsGkAtoms::form)) break;

    walkUp = walkUp->LocalParent();
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// HTMLOutputIterator
////////////////////////////////////////////////////////////////////////////////

HTMLOutputIterator::HTMLOutputIterator(DocAccessible* aDocument,
                                       nsIContent* aElement)
    : mRelIter(aDocument, aElement, nsGkAtoms::_for) {}

LocalAccessible* HTMLOutputIterator::Next() {
  LocalAccessible* output = nullptr;
  while ((output = mRelIter.Next())) {
    if (output->GetContent()->IsHTMLElement(nsGkAtoms::output)) return output;
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// XULLabelIterator
////////////////////////////////////////////////////////////////////////////////

XULLabelIterator::XULLabelIterator(DocAccessible* aDocument,
                                   nsIContent* aElement)
    : mRelIter(aDocument, aElement, nsGkAtoms::control) {}

LocalAccessible* XULLabelIterator::Next() {
  LocalAccessible* label = nullptr;
  while ((label = mRelIter.Next())) {
    if (label->GetContent()->IsXULElement(nsGkAtoms::label)) return label;
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// XULDescriptionIterator
////////////////////////////////////////////////////////////////////////////////

XULDescriptionIterator::XULDescriptionIterator(DocAccessible* aDocument,
                                               nsIContent* aElement)
    : mRelIter(aDocument, aElement, nsGkAtoms::control) {}

LocalAccessible* XULDescriptionIterator::Next() {
  LocalAccessible* descr = nullptr;
  while ((descr = mRelIter.Next())) {
    if (descr->GetContent()->IsXULElement(nsGkAtoms::description)) return descr;
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// AssociatedElementsIterator
////////////////////////////////////////////////////////////////////////////////

AssociatedElementsIterator::AssociatedElementsIterator(DocAccessible* aDoc,
                                                       nsIContent* aContent,
                                                       nsAtom* aIDRefsAttr)
    : mContent(aContent), mDoc(aDoc), mElemIdx(0) {
  if (!mContent->IsElement()) {
    return;
  }
  auto elements =
      mContent->AsElement()->GetAttrAssociatedElementsInternal(aIDRefsAttr);
  if (elements) {
    mElements.SwapElements(*elements);
  } else if (auto* element = nsGenericHTMLElement::FromNode(aContent)) {
    if (auto* internals = element->GetInternals()) {
      elements = internals->GetAttrElements(aIDRefsAttr);
      if (elements) {
        mElements.SwapElements(*elements);
      }
    }
  }
}

dom::Element* AssociatedElementsIterator::NextElem() {
  return mElements.SafeElementAt(mElemIdx++);
}

LocalAccessible* AssociatedElementsIterator::Next() {
  dom::Element* nextEl = nullptr;
  while ((nextEl = NextElem())) {
    LocalAccessible* acc = mDoc->GetAccessible(nextEl);
    if (acc) {
      return acc;
    }
  }
  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// SingleAccIterator
////////////////////////////////////////////////////////////////////////////////

Accessible* SingleAccIterator::Next() {
  Accessible* nextAcc = mAcc;
  mAcc = nullptr;
  if (!nextAcc) {
    return nullptr;
  }

  MOZ_ASSERT(!nextAcc->IsLocal() || !nextAcc->AsLocal()->IsDefunct(),
             "Iterator references defunct accessible?");
  return nextAcc;
}

////////////////////////////////////////////////////////////////////////////////
// ItemIterator
////////////////////////////////////////////////////////////////////////////////

Accessible* ItemIterator::Next() {
  if (mContainer) {
    mAnchor = AccGroupInfo::FirstItemOf(mContainer);
    mContainer = nullptr;
    return mAnchor;
  }

  if (mAnchor) {
    mAnchor = AccGroupInfo::NextItemTo(mAnchor);
  }

  return mAnchor;
}

////////////////////////////////////////////////////////////////////////////////
// XULTreeItemIterator
////////////////////////////////////////////////////////////////////////////////

XULTreeItemIterator::XULTreeItemIterator(const XULTreeAccessible* aXULTree,
                                         nsITreeView* aTreeView,
                                         int32_t aRowIdx)
    : mXULTree(aXULTree),
      mTreeView(aTreeView),
      mRowCount(-1),
      mContainerLevel(-1),
      mCurrRowIdx(aRowIdx + 1) {
  mTreeView->GetRowCount(&mRowCount);
  if (aRowIdx != -1) mTreeView->GetLevel(aRowIdx, &mContainerLevel);
}

LocalAccessible* XULTreeItemIterator::Next() {
  while (mCurrRowIdx < mRowCount) {
    int32_t level = 0;
    mTreeView->GetLevel(mCurrRowIdx, &level);

    if (level == mContainerLevel + 1) {
      return mXULTree->GetTreeItemAccessible(mCurrRowIdx++);
    }

    if (level <= mContainerLevel) {  // got level up
      mCurrRowIdx = mRowCount;
      break;
    }

    mCurrRowIdx++;
  }

  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// RemoteAccIterator
////////////////////////////////////////////////////////////////////////////////

Accessible* RemoteAccIterator::Next() {
  while (mIndex < mIds.Length()) {
    uint64_t id = mIds[mIndex++];
    Accessible* acc = mDoc->GetAccessible(id);
    if (acc) {
      return acc;
    }
  }
  return nullptr;
}

////////////////////////////////////////////////////////////////////////////////
// ArrayAccIterator
////////////////////////////////////////////////////////////////////////////////

Accessible* ArrayAccIterator::Next() {
  if (mIndex < mAccs.Length()) {
    return mAccs[mIndex++];
  }
  return nullptr;
}
