/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIX509CertDB.h"

#include "CryptoTask.h"
#include "QWACTrustDomain.h"
#include "mozilla/dom/Promise.h"
#include "mozpkix/pkix.h"
#include "mozpkix/pkixder.h"
#include "mozpkix/pkixnss.h"
#include "mozpkix/pkixtypes.h"
#include "mozpkix/pkixutil.h"
#include "nsIX509Cert.h"
#include "nsNSSCertificateDB.h"

using namespace mozilla::pkix;
using namespace mozilla::psm;

using mozilla::dom::Promise;

class Verify1QWACTask : public mozilla::CryptoTask {
 public:
  Verify1QWACTask(nsIX509Cert* aCert,
                  const nsTArray<RefPtr<nsIX509Cert>>& aCollectedCerts,
                  RefPtr<Promise>& aPromise)
      : mCert(aCert),
        mCollectedCerts(aCollectedCerts.Clone()),
        mPromise(new nsMainThreadPtrHolder<Promise>("Verify1QWACTask::mPromise",
                                                    aPromise)),
        mVerifiedAs1QWAC(false) {}

 private:
  virtual nsresult CalculateResult() override;
  virtual void CallCallback(nsresult rv) override;

  RefPtr<nsIX509Cert> mCert;
  nsTArray<RefPtr<nsIX509Cert>> mCollectedCerts;
  nsMainThreadPtrHandle<Promise> mPromise;

  bool mVerifiedAs1QWAC;
};

// Does this certificate have the correct qcStatements ("qualified certificate
// statements") to be a QWAC ("qualified website authentication certificate")?
// ETSI EN 319 412-5 Clauses 4.2.1 and 4.2.3 state that a certificate issued in
// compliance with Annex IV of Regulation (EU) No 910/2014 (i.e. a QWAC) has
//   1) a QCStatement with statementId equal to id-etsi-qsc-QcCompliance and
//      an omitted statementInfo, and
//   2) a QCStatement with statementId equal to id-etsi-qcs-QcType and a
//      statementInfo of length one that contains the id-etsi-qct-web
//      identifier.
bool CertHasQWACSQCStatements(const nsTArray<uint8_t>& certDER) {
  using namespace mozilla::pkix::der;

  // python DottedOIDToCode.py id-etsi-qcs-QcCompliance 0.4.0.1862.1.1
  static const uint8_t id_etsi_qcs_QcCompliance[] = {0x04, 0x00, 0x8e,
                                                     0x46, 0x01, 0x01};

  // python DottedOIDToCode.py id-etsi-qcs-QcType 0.4.0.1862.1.6
  static const uint8_t id_etsi_qcs_QcType[] = {0x04, 0x00, 0x8e,
                                               0x46, 0x01, 0x06};

  // python DottedOIDToCode.py id-etsi-qct-web 0.4.0.1862.1.6.3
  static const uint8_t id_etsi_qct_web[] = {0x04, 0x00, 0x8e, 0x46,
                                            0x01, 0x06, 0x03};

  Input cert;
  if (cert.Init(certDER.Elements(), certDER.Length()) != Success) {
    return false;
  }
  BackCert backCert(cert, EndEntityOrCA::MustBeEndEntity, nullptr);
  if (backCert.Init() != Success) {
    return false;
  }
  const Input* qcStatementsInput(backCert.GetQCStatements());
  if (!qcStatementsInput) {
    return false;
  }
  Reader qcStatements(*qcStatementsInput);
  // QCStatements ::= SEQUENCE OF QCStatement
  // QCStatement ::= SEQUENCE {
  //     statementId   QC-STATEMENT.&Id({SupportedStatements}),
  //     statementInfo QC-STATEMENT.&Type
  //     ({SupportedStatements}{@statementId}) OPTIONAL }
  //
  // SupportedStatements QC-STATEMENT ::= { qcStatement-1,...}
  bool foundQCComplianceStatement = false;
  bool foundQCTypeStatementWithWebType = false;
  mozilla::pkix::Result rv =
      NestedOf(qcStatements, SEQUENCE, SEQUENCE, EmptyAllowed::No,
               [&](Reader& qcStatementContents) {
                 Reader statementId;
                 mozilla::pkix::Result rv = ExpectTagAndGetValue(
                     qcStatementContents, OIDTag, statementId);
                 if (rv != Success) {
                   return rv;
                 }
                 if (statementId.MatchRest(id_etsi_qcs_QcCompliance)) {
                   foundQCComplianceStatement = true;
                   return End(qcStatementContents);
                 }
                 if (statementId.MatchRest(id_etsi_qcs_QcType)) {
                   Reader supportedStatementsContents;
                   rv = ExpectTagAndGetValue(qcStatementContents, SEQUENCE,
                                             supportedStatementsContents);
                   if (rv != Success) {
                     return rv;
                   }
                   Reader supportedStatementId;
                   rv = ExpectTagAndGetValue(supportedStatementsContents,
                                             OIDTag, supportedStatementId);
                   if (supportedStatementId.MatchRest(id_etsi_qct_web)) {
                     foundQCTypeStatementWithWebType = true;
                   }
                   rv = End(supportedStatementsContents);
                   if (rv != Success) {
                     return rv;
                   }
                   return End(qcStatementContents);
                 }
                 // Ignore the contents of unknown qcStatements.
                 qcStatementContents.SkipToEnd();
                 return Success;
               });
  if (rv != Success) {
    return false;
  }
  return foundQCComplianceStatement && foundQCTypeStatementWithWebType;
}

// For 1-QWACs, ETSI TS 119 411-5 V2.1.1 clause 6.1.2 ("Validation of QWACs")
// item 5 references clause 4.1.2, which references clause 4.1.1, which states
// that such certificates must have either the QEVCP-w or QNCP-w policy as
// specified in ETSI EN 319 411-2.
bool CertHas1QWACPolicy(const nsTArray<uint8_t>& certDER) {
  using namespace mozilla::pkix::der;

  // QEVCP-w is itu-t(0) identified-organization(4) etsi(0)
  //   qualified-certificate-policies(194112) policy-identifiers(1) qcp-web (4)
  // python DottedOIDToCode.py qevcp-w 0.4.0.194112.1.4
  static const uint8_t qevcp_w[] = {0x04, 0x00, 0x8b, 0xec, 0x40, 0x01, 0x04};

  // QNCP-w is itu-t(0) identified-organization(4) etsi(0)
  //   qualified-certificate-policies(194112) policy-identifiers(1) qncp-web (5)
  // python DottedOIDToCode.py qncp-w 0.4.0.194112.1.5
  static const uint8_t qncp_w[] = {0x04, 0x00, 0x8b, 0xec, 0x40, 0x01, 0x05};

  Input cert;
  if (cert.Init(certDER.Elements(), certDER.Length()) != Success) {
    return false;
  }
  BackCert backCert(cert, EndEntityOrCA::MustBeEndEntity, nullptr);
  if (backCert.Init() != Success) {
    return false;
  }
  const Input* certificatePoliciesInput(backCert.GetCertificatePolicies());
  if (!certificatePoliciesInput) {
    return false;
  }
  Reader certificatePolicies(*certificatePoliciesInput);
  // certificatePolicies ::= SEQUENCE SIZE (1..MAX) OF PolicyInformation
  // PolicyInformation ::= SEQUENCE {
  //   policyIdentifier   CertPolicyId,
  //   ...
  // }
  // CertPolicyId ::= OBJECT IDENTIFIER
  bool found1QWACPolicy = false;
  mozilla::pkix::Result rv =
      NestedOf(certificatePolicies, SEQUENCE, SEQUENCE, EmptyAllowed::No,
               [&](Reader& policyInformationContents) {
                 Reader policyIdentifier;
                 mozilla::pkix::Result rv = ExpectTagAndGetValue(
                     policyInformationContents, OIDTag, policyIdentifier);
                 if (rv != Success) {
                   return rv;
                 }
                 if (policyIdentifier.MatchRest(qevcp_w) ||
                     policyIdentifier.MatchRest(qncp_w)) {
                   found1QWACPolicy = true;
                 }
                 return Success;
               });
  if (rv != Success) {
    return false;
  }
  return found1QWACPolicy;
}

nsresult Verify1QWACTask::CalculateResult() {
  mozilla::psm::QWACTrustDomain trustDomain(mCollectedCerts);
  nsTArray<uint8_t> certDER;
  nsresult rv = mCert->GetRawDER(certDER);
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (!CertHasQWACSQCStatements(certDER)) {
    return NS_OK;
  }
  if (!CertHas1QWACPolicy(certDER)) {
    return NS_OK;
  }
  Input cert;
  if (cert.Init(certDER.Elements(), certDER.Length()) != Success) {
    return NS_ERROR_FAILURE;
  }
  if (BuildCertChain(trustDomain, cert, Now(), EndEntityOrCA::MustBeEndEntity,
                     KeyUsage::noParticularKeyUsageRequired,
                     KeyPurposeId::anyExtendedKeyUsage, CertPolicyId::anyPolicy,
                     nullptr) != Success) {
    return NS_OK;
  }
  mVerifiedAs1QWAC = true;
  return NS_OK;
}

void Verify1QWACTask::CallCallback(nsresult rv) {
  if (NS_FAILED(rv)) {
    mPromise->MaybeReject(rv);
  } else {
    mPromise->MaybeResolve(mVerifiedAs1QWAC);
  }
}

NS_IMETHODIMP
nsNSSCertificateDB::AsyncVerify1QWAC(
    nsIX509Cert* aCert, const nsTArray<RefPtr<nsIX509Cert>>& aCollectedCerts,
    JSContext* aCx, mozilla::dom::Promise** aPromise) {
  NS_ENSURE_ARG_POINTER(aCx);

  nsIGlobalObject* globalObject = xpc::CurrentNativeGlobal(aCx);
  if (!globalObject) {
    return NS_ERROR_UNEXPECTED;
  }
  mozilla::ErrorResult result;
  RefPtr<Promise> promise = Promise::Create(globalObject, result);
  if (result.Failed()) {
    return result.StealNSResult();
  }

  RefPtr<Verify1QWACTask> task(
      new Verify1QWACTask(aCert, aCollectedCerts, promise));
  nsresult rv = task->Dispatch();
  if (NS_FAILED(rv)) {
    return rv;
  }

  promise.forget(aPromise);
  return NS_OK;
}
