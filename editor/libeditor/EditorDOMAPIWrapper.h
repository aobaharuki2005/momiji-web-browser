/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef EditorDOMAPIWrapper_h
#define EditorDOMAPIWrapper_h

#include "EditorBase.h"  // for EditorBase

#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/dom/CharacterData.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/MutationEventBinding.h"
#include "nsAtom.h"
#include "nsIContent.h"
#include "nsICSSDeclaration.h"
#include "nsIMutationObserver.h"
#include "nsINode.h"
#include "nsPrintfCString.h"
#include "nsString.h"
#include "nsStyledElement.h"

namespace mozilla {

/**
 * The base class of wrappers of DOM API which modifies the DOM.  Editor should
 * update DOM via the following classes unless the node has not been connected
 * to any document yet.
 */
class MOZ_STACK_CLASS AutoDOMAPIWrapperBase {
 protected:
  using CharacterData = dom::CharacterData;
  using Element = dom::Element;

 public:
  // This method is available only while a subclass is calling a DOM API.
  [[nodiscard]] virtual bool IsExpectedContentAppended(
      nsIContent* aFirstNewContent) const {
    return false;
  }
  // This method is available only while a subclass is calling a DOM API.
  [[nodiscard]] virtual bool IsExpectedContentInserted(
      nsIContent* aChild) const {
    return false;
  }
  // This method is available only while a subclass is calling a DOM API.
  [[nodiscard]] virtual bool IsExpectedContentWillBeRemoved(
      nsIContent* aChild) const {
    return false;
  }
  // This method is available only while a subclass is calling a DOM API.
  [[nodiscard]] virtual bool IsExpectedAttributeChanged(
      Element* aElement, int32_t aNameSpaceID, nsAtom* aAttribute,
      int32_t aModType, const nsAttrValue* aOldValue) const {
    return false;
  }
  // This method is available only while a subclass is calling a DOM API.
  [[nodiscard]] virtual bool IsExpectedCharacterDataChanged(
      nsIContent* aContent, const CharacterDataChangeInfo& aInfo) const {
    return false;
  }

  enum class DOMAPI {
    // AutoNodeAPIWrapper
    nsINode_AppendChild,
    nsINode_InsertBefore,
    nsINode_Remove,
    nsINode_RemoveChild,
    // AutoElementAttrAPIWrapper
    Element_SetAttr,
    Element_UnsetAttr,
    // AutoCharacterDataAPIWrapper
    CharacterData_DeleteData,
    CharacterData_InsertData,
    CharacterData_ReplaceData,
    CharacterData_SetData,
    // AutoCSSDeclarationAPIWrapper
    CSSDeclaration_SetProperty,
    CSSDeclaration_RemoveProperty,
  };

  [[nodiscard]] DOMAPI Type() const { return *mType; }

#ifdef DEBUG
  virtual ~AutoDOMAPIWrapperBase() { MOZ_ASSERT(mType.isSome()); }
#endif

 protected:
  void StartToCall(DOMAPI aCallingAPI) { mType.emplace(aCallingAPI); }

  MOZ_CAN_RUN_SCRIPT explicit AutoDOMAPIWrapperBase(EditorBase& aEditorBase)
      : mEditorBase(aEditorBase) {}
  MOZ_KNOWN_LIVE EditorBase& mEditorBase;
  Maybe<DOMAPI> mType;
};

/**
 * Wrapper class of nsINode::AppendChild, nsINode::InsertBefore, nsINode::Remove
 * and nsINode::RemoveChild.
 */
class MOZ_STACK_CLASS AutoNodeAPIWrapper : public AutoDOMAPIWrapperBase {
 public:
  static AutoNodeAPIWrapper* FromBase(AutoDOMAPIWrapperBase* aBase) {
    switch (aBase->Type()) {
      case DOMAPI::nsINode_AppendChild:
      case DOMAPI::nsINode_InsertBefore:
      case DOMAPI::nsINode_Remove:
      case DOMAPI::nsINode_RemoveChild:
        return static_cast<AutoNodeAPIWrapper*>(aBase);
      default:
        return nullptr;
    }
  }
  static AutoNodeAPIWrapper* FromBaseOrNull(AutoDOMAPIWrapperBase* aBase) {
    return aBase ? FromBase(aBase) : nullptr;
  }
  static const AutoNodeAPIWrapper* FromBase(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBase(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }
  static const AutoNodeAPIWrapper* FromBaseOrNull(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBaseOrNull(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }

  MOZ_CAN_RUN_SCRIPT AutoNodeAPIWrapper(EditorBase& aEditorBase, nsINode& aNode)
      : AutoDOMAPIWrapperBase(aEditorBase), mNode(&aNode) {}

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult AppendChild(nsIContent& aChild) {
    mChild = &aChild;
    StartToCall(DOMAPI::nsINode_AppendChild);
    IgnoredErrorResult error;
    MOZ_KnownLive(mNode)->AppendChild(aChild, error);
    error.WouldReportJSException();
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("nsINode::AppendChild() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult
  InsertBefore(nsIContent& aChild, nsIContent* aReferenceChild) {
    mChild = &aChild;
    mReference = aReferenceChild;
    StartToCall(DOMAPI::nsINode_InsertBefore);
    IgnoredErrorResult error;
    MOZ_KnownLive(mNode)->InsertBefore(aChild, aReferenceChild, error);
    error.WouldReportJSException();
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("nsINode::InsertBefore() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult RemoveChild(nsIContent& aChild) {
    mChild = &aChild;
    StartToCall(DOMAPI::nsINode_RemoveChild);
    IgnoredErrorResult error;
    MOZ_KnownLive(mNode)->RemoveChild(aChild, error);
    error.WouldReportJSException();
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("nsINode::RemoveChild() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult Remove() {
    mChild = nsIContent::FromNode(mNode);
    MOZ_ASSERT(mChild);
    mNode = mChild->GetParentNode();
    StartToCall(DOMAPI::nsINode_Remove);
    MOZ_KnownLive(mChild)->Remove();
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    return NS_OK;
  }

  [[nodiscard]] bool IsExpectedResult() const {
    switch (Type()) {
      case DOMAPI::nsINode_AppendChild:
      case DOMAPI::nsINode_InsertBefore:
        return mChild->GetParentNode() == mNode &&
               mChild->GetNextSibling() == mReference;
      case DOMAPI::nsINode_RemoveChild:
      case DOMAPI::nsINode_Remove:
        return !mChild->GetParentNode();
      default:
        MOZ_ASSERT_UNREACHABLE("Instantiated with wrong type?");
        return false;
    }
  }

  [[nodiscard]] bool IsExpectedContentAppended(
      nsIContent* aFirstNewContent) const override {
    return (Type() == DOMAPI::nsINode_AppendChild ||
            Type() == DOMAPI::nsINode_InsertBefore) &&
           aFirstNewContent == mChild && IsExpectedResult();
  }
  [[nodiscard]] bool IsExpectedContentInserted(
      nsIContent* aChild) const override {
    return (Type() == DOMAPI::nsINode_AppendChild ||
            Type() == DOMAPI::nsINode_InsertBefore) &&
           aChild == mChild && IsExpectedResult();
  }
  [[nodiscard]] bool IsExpectedContentWillBeRemoved(
      nsIContent* aChild) const override {
    if ((Type() == DOMAPI::nsINode_RemoveChild ||
         Type() == DOMAPI::nsINode_Remove) &&
        aChild == mChild && aChild->GetParentNode() == mNode) {
      return true;
    }
    return (Type() == DOMAPI::nsINode_AppendChild ||
            Type() == DOMAPI::nsINode_InsertBefore) &&
           aChild == mChild;
  }

 protected:
  // nullptr if nsINode::Remove() is called when no parent.
  nsINode* mNode;
  nsIContent* mChild = nullptr;
  nsIContent* mReference = nullptr;
};

/**
 * Wrapper class of Element::SetAttr and Element::UnsetAttr.
 */
class MOZ_STACK_CLASS AutoElementAttrAPIWrapper : public AutoDOMAPIWrapperBase {
 public:
  static AutoElementAttrAPIWrapper* FromBase(AutoDOMAPIWrapperBase* aBase) {
    switch (aBase->Type()) {
      case DOMAPI::Element_SetAttr:
      case DOMAPI::Element_UnsetAttr:
        return static_cast<AutoElementAttrAPIWrapper*>(aBase);
      default:
        return nullptr;
    }
  }
  static AutoElementAttrAPIWrapper* FromBaseOrNull(
      AutoDOMAPIWrapperBase* aBase) {
    return aBase ? FromBase(aBase) : nullptr;
  }
  static const AutoElementAttrAPIWrapper* FromBase(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBase(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }
  static const AutoElementAttrAPIWrapper* FromBaseOrNull(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBaseOrNull(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }

  MOZ_CAN_RUN_SCRIPT AutoElementAttrAPIWrapper(EditorBase& aEditorBase,
                                               Element& aElement)
      : AutoDOMAPIWrapperBase(aEditorBase), mElement(aElement) {}

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult SetAttr(nsAtom* aAttr,
                                                    const nsAString& aNewValue,
                                                    bool aNotify) {
    mAttr = aAttr;
    mNewValuePtr = &aNewValue;
    StartToCall(DOMAPI::Element_SetAttr);
    nsresult rv =
        mElement.SetAttr(kNameSpaceID_None, aAttr, aNewValue, aNotify);
    // Don't keep storing the pointer, nobody can guarantee the lifetime.
    mNewValuePtr = nullptr;
    NS_WARNING_ASSERTION(
        NS_SUCCEEDED(rv),
        nsPrintfCString(
            "Element::SetAttr(kNameSpaceID_None, %s, %s, %s) failed",
            nsAutoAtomCString(mAttr).get(),
            NS_ConvertUTF16toUTF8(aNewValue).get(), TrueOrFalse(aNotify))
            .get());
    return rv;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult UnsetAttr(nsAtom* aAttr,
                                                      bool aNotify) {
    mAttr = aAttr;
    StartToCall(DOMAPI::Element_UnsetAttr);
    nsresult rv = mElement.UnsetAttr(kNameSpaceID_None, mAttr, aNotify);
    NS_WARNING_ASSERTION(
        NS_SUCCEEDED(rv),
        nsPrintfCString("Element::UnsetAttr(kNameSpaceID_None, %s, %s) failed",
                        nsAutoAtomCString(mAttr).get(), TrueOrFalse(aNotify))
            .get());
    return rv;
  }

  [[nodiscard]] bool IsExpectedResult(const nsAString& aExpectedValue) const {
    switch (Type()) {
      case DOMAPI::Element_SetAttr: {
        nsAutoString value;
        const bool hasAttr = mElement.GetAttr(kNameSpaceID_None, mAttr, value);
        return hasAttr && value == aExpectedValue;
      }
      case DOMAPI::Element_UnsetAttr:
        return !mElement.HasAttr(kNameSpaceID_None, mAttr);
      default:
        MOZ_ASSERT_UNREACHABLE("Instantiated with wrong type?");
        return false;
    }
  }

  [[nodiscard]] virtual bool IsExpectedAttributeChanged(
      Element* aElement, int32_t aNameSpaceID, nsAtom* aAttribute,
      int32_t aModType, const nsAttrValue* aOldValue) const {
    switch (Type()) {
      case DOMAPI::Element_SetAttr:
        return (aModType == dom::MutationEvent_Binding::MODIFICATION ||
                aModType == dom::MutationEvent_Binding::ADDITION) &&
               aElement == &mElement && aNameSpaceID == kNameSpaceID_None &&
               aAttribute == mAttr && mNewValuePtr &&
               IsExpectedResult(*mNewValuePtr);
      case DOMAPI::Element_UnsetAttr:
        return aModType == dom::MutationEvent_Binding::REMOVAL &&
               aElement == &mElement && aNameSpaceID == kNameSpaceID_None &&
               aAttribute == mAttr;
      default:
        return false;
    }
  }

 protected:
  MOZ_KNOWN_LIVE Element& mElement;
  nsAtom* mAttr = nullptr;
  // For avoiding to copy the string, we store the given string pointer only
  // while calling the API because it's enough to check whether checking
  // mutations are expected ones or not.
  const nsAString* mNewValuePtr = nullptr;
};

/**
 * Wrapper class of CharacterData::DeleteData, CharacterData::InsertData,
 * CharacterData::ReplaceData and CharacterData::SetData.
 */
class MOZ_STACK_CLASS AutoCharacterDataAPIWrapper
    : public AutoDOMAPIWrapperBase {
 public:
  static AutoCharacterDataAPIWrapper* FromBase(AutoDOMAPIWrapperBase* aBase) {
    switch (aBase->Type()) {
      case DOMAPI::CharacterData_DeleteData:
      case DOMAPI::CharacterData_InsertData:
      case DOMAPI::CharacterData_ReplaceData:
      case DOMAPI::CharacterData_SetData:
        return static_cast<AutoCharacterDataAPIWrapper*>(aBase);
      default:
        return nullptr;
    }
  }
  static AutoCharacterDataAPIWrapper* FromBaseOrNull(
      AutoDOMAPIWrapperBase* aBase) {
    return aBase ? FromBase(aBase) : nullptr;
  }
  static const AutoCharacterDataAPIWrapper* FromBase(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBase(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }
  static const AutoCharacterDataAPIWrapper* FromBaseOrNull(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBaseOrNull(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }

  MOZ_CAN_RUN_SCRIPT AutoCharacterDataAPIWrapper(EditorBase& aEditorBase,
                                                 CharacterData& aNode)
      : AutoDOMAPIWrapperBase(aEditorBase), mCharacterData(aNode) {}

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult DeleteData(uint32_t aOffset,
                                                       uint32_t aLength) {
    mOffset = aOffset;
    mReplaceLength = aLength;
    StartToCall(DOMAPI::CharacterData_DeleteData);
    IgnoredErrorResult error;
    mCharacterData.DeleteData(mOffset, mReplaceLength, error);
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("CharacterData::DeleteData() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult InsertData(uint32_t aOffset,
                                                       const nsAString& aData) {
    mOffset = aOffset;
    mDataPtr = &aData;
    StartToCall(DOMAPI::CharacterData_InsertData);
    IgnoredErrorResult error;
    mCharacterData.InsertData(mOffset, aData, error);
    // Don't keep storing the pointer, nobody can guarantee the lifetime.
    mDataPtr = nullptr;
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("CharacterData::InsertData() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult ReplaceData(
      uint32_t aOffset, uint32_t aReplaceLength, const nsAString& aData) {
    mOffset = aOffset;
    mReplaceLength = aReplaceLength;
    mDataPtr = &aData;
    StartToCall(DOMAPI::CharacterData_ReplaceData);
    IgnoredErrorResult error;
    mCharacterData.ReplaceData(mOffset, mReplaceLength, aData, error);
    // Don't keep storing the pointer, nobody can guarantee the lifetime.
    mDataPtr = nullptr;
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("CharacterData::ReplaceData() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult SetData(const nsAString& aData) {
    mDataPtr = &aData;
    StartToCall(DOMAPI::CharacterData_SetData);
    IgnoredErrorResult error;
    mCharacterData.SetData(aData, error);
    // Don't keep storing the pointer, nobody can guarantee the lifetime.
    mDataPtr = nullptr;
    if (NS_WARN_IF(mEditorBase.Destroyed())) {
      return NS_ERROR_EDITOR_DESTROYED;
    }
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING("CharacterData::SetData() failed");
      return error.StealNSResult();
    }
    return NS_OK;
  }

  /**
   * Be aware, this may be too slow for the normal path.  This should be used
   * by debugging code like assertions or logging code.
   *
   * @param aExpectedData       Specify the data which you call an above API
   *                            calling method.
   */
  [[nodiscard]] bool IsExpectedResult(const nsAString& aExpectedData) const {
    switch (Type()) {
      case DOMAPI::CharacterData_DeleteData:
        // XXX We don't check whether the final data is expected one because
        // we need to store the original value or the expected value, but that
        // may require a big buffer if the text node has long text.
        return mCharacterData.TextDataLength() >= mOffset;
      case DOMAPI::CharacterData_InsertData:
      case DOMAPI::CharacterData_ReplaceData: {
        if (MOZ_UNLIKELY(mCharacterData.TextDataLength() <
                         mOffset + aExpectedData.Length())) {
          return false;
        }
        // Let's check only the new data is expected value.
        nsAutoString data;
        mCharacterData.GetData(data);
        return Substring(data, mOffset, aExpectedData.Length()) ==
               aExpectedData;
      }
      case DOMAPI::CharacterData_SetData: {
        if (MOZ_UNLIKELY(mCharacterData.TextDataLength() !=
                         aExpectedData.Length())) {
          return false;
        }
        // We can check strictly only in this case.  However, getting the
        // value may be slow if the text node has long text.
        nsAutoString data;
        mCharacterData.GetData(data);
        return data == aExpectedData;
      }
      default:
        MOZ_ASSERT_UNREACHABLE("Instantiated with wrong type?");
        return false;
    }
  }

  [[nodiscard]] virtual bool IsExpectedCharacterDataChanged(
      nsIContent* aContent, const CharacterDataChangeInfo& aInfo) const {
    return aContent == &mCharacterData && aInfo.mChangeStart == mOffset &&
           aInfo.LengthOfRemovedText() == mReplaceLength && mDataPtr &&
           aInfo.mReplaceLength == mDataPtr->Length() && !aInfo.mDetails &&
           IsExpectedResult(*mDataPtr);
  }

 protected:
  MOZ_KNOWN_LIVE CharacterData& mCharacterData;
  uint32_t mOffset = 0;
  uint32_t mReplaceLength = 0;
  // For avoiding to copy the string, we store the given string pointer only
  // while calling the API because it's enough to check whether checking
  // mutations are expected ones or not.
  const nsAString* mDataPtr = nullptr;
};

/**
 * Wrapper class of nsICSSDeclaration::SetProperty and
 * nsICSSDeclaration::RemoveProperty which modifies `style` attribute.
 */
class MOZ_STACK_CLASS AutoCSSDeclarationAPIWrapper
    : public AutoDOMAPIWrapperBase {
 public:
  static AutoCSSDeclarationAPIWrapper* FromBase(AutoDOMAPIWrapperBase* aBase) {
    switch (aBase->Type()) {
      case DOMAPI::CSSDeclaration_SetProperty:
      case DOMAPI::CSSDeclaration_RemoveProperty:
        return static_cast<AutoCSSDeclarationAPIWrapper*>(aBase);
      default:
        return nullptr;
    }
  }
  static AutoCSSDeclarationAPIWrapper* FromBaseOrNull(
      AutoDOMAPIWrapperBase* aBase) {
    return aBase ? FromBase(aBase) : nullptr;
  }
  static const AutoCSSDeclarationAPIWrapper* FromBase(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBase(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }
  static const AutoCSSDeclarationAPIWrapper* FromBaseOrNull(
      const AutoDOMAPIWrapperBase* aBase) {
    return FromBaseOrNull(const_cast<AutoDOMAPIWrapperBase*>(aBase));
  }

  MOZ_CAN_RUN_SCRIPT AutoCSSDeclarationAPIWrapper(
      EditorBase& aEditorBase, nsStyledElement& aStyledElement,
      nsICSSDeclaration* aDeclaration = nullptr)
      : AutoDOMAPIWrapperBase(aEditorBase),
        mStyledElement(aStyledElement),
        mCSSDeclaration(aDeclaration ? *aDeclaration
                                     : *aStyledElement.Style()) {}

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult
  SetProperty(const nsACString& aPropertyName, const nsACString& aValues,
              const nsACString& aPriority) {
    mPropertyNamePtr = &aPropertyName;
    mValuesPtr = &aValues;
    mPriorityPtr = &aPriority;
    StartToCall(DOMAPI::CSSDeclaration_SetProperty);
    IgnoredErrorResult error;
    mCSSDeclaration->SetProperty(aPropertyName, aValues, aPriority, error);
    // Don't keep storing the pointers, nobody can guarantee the lifetime.
    mPropertyNamePtr = mValuesPtr = mPriorityPtr = nullptr;
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING(
          nsPrintfCString("nsICSSDeclaration::SetProperty(\"%s\", \"%s\", "
                          "\"%s\") failed (mStyledElement=%s)",
                          PromiseFlatCString(aPropertyName).get(),
                          PromiseFlatCString(aValues).get(),
                          PromiseFlatCString(aPriority).get(),
                          ToString(mStyledElement).c_str())
              .get());
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] MOZ_CAN_RUN_SCRIPT nsresult
  RemoveProperty(const nsACString& aPropertyName) {
    mPropertyNamePtr = &aPropertyName;
    StartToCall(DOMAPI::CSSDeclaration_RemoveProperty);
    IgnoredErrorResult error;
    mCSSDeclaration->RemoveProperty(aPropertyName, mRemovedValue, error);
    // Don't keep storing the pointers, nobody can guarantee the lifetime.
    mPropertyNamePtr = mValuesPtr = mPriorityPtr = nullptr;
    if (MOZ_UNLIKELY(error.Failed())) {
      NS_WARNING(
          nsPrintfCString("nsICSSDeclaration::RemoveProperty(\"%s\") failed "
                          "(mStyledElement=%s, removed value=\"%s\")",
                          PromiseFlatCString(aPropertyName).get(),
                          ToString(mStyledElement).c_str(), mRemovedValue.get())
              .get());
      return error.StealNSResult();
    }
    return NS_OK;
  }

  [[nodiscard]] const nsAutoCString& RemovedValueRef() const {
    MOZ_ASSERT(Type() == DOMAPI::CSSDeclaration_RemoveProperty);
    return mRemovedValue;
  }

  [[nodiscard]] virtual bool IsExpectedAttributeChanged(
      Element* aElement, int32_t aNameSpaceID, nsAtom* aAttribute,
      int32_t aModType, const nsAttrValue* aOldValue) const {
    // XXX We don't check the style value is expected one because it requires
    // to store the original value and compute the expected new value.
    return aAttribute == nsGkAtoms::style &&
           aNameSpaceID == kNameSpaceID_None && aElement == &mStyledElement &&
           (aModType == dom::MutationEvent_Binding::ADDITION ||
            aModType == dom::MutationEvent_Binding::REMOVAL);
  }

 protected:
  MOZ_KNOWN_LIVE nsStyledElement& mStyledElement;
  MOZ_KNOWN_LIVE const OwningNonNull<nsICSSDeclaration> mCSSDeclaration;
  nsAutoCString mRemovedValue;
  // For avoiding to copy the strings, we store the given string pointers only
  // while calling the API because it's enough to check whether checking
  // mutations are expected ones or not.
  const nsACString* mPropertyNamePtr = nullptr;
  const nsACString* mValuesPtr = nullptr;
  const nsACString* mPriorityPtr = nullptr;
};

}  // namespace mozilla

#endif  // #ifndef EditorDOMAPIWrapper_h
