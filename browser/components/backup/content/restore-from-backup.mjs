/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, styleMap } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { ERRORS } from "chrome://browser/content/backup/backup-constants.mjs";
import { getErrorL10nId } from "chrome://browser/content/backup/backup-errors.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-message-bar.mjs";

/**
 * The widget for allowing users to select and restore from a
 * a backup file.
 */
export default class RestoreFromBackup extends MozLitElement {
  #placeholderFileIconURL = "chrome://global/skin/icons/page-portrait.svg";

  static properties = {
    _fileIconURL: { type: String },
    aboutWelcomeEmbedded: { type: Boolean },
    backupServiceState: { type: Object },
  };

  static get queries() {
    return {
      filePicker: "#backup-filepicker-input",
      passwordInput: "#backup-password-input",
      cancelButtonEl: "#restore-from-backup-cancel-button",
      confirmButtonEl: "#restore-from-backup-confirm-button",
      chooseButtonEl: "#backup-filepicker-button",
      errorMessageEl: "#restore-from-backup-error",
    };
  }

  get isIncorrectPassword() {
    return this.backupServiceState?.recoveryErrorCode === ERRORS.UNAUTHORIZED;
  }

  constructor() {
    super();
    this._fileIconURL = "";
    // Set the default state
    this.backupServiceState = {
      backupDirPath: "",
      backupFileToRestore: null,
      backupFileInfo: null,
      defaultParent: {
        fileName: "",
        path: "",
        iconURL: "",
      },
      encryptionEnabled: false,
      scheduledBackupsEnabled: false,
      lastBackupDate: null,
      lastBackupFileName: "",
      supportBaseLink: "",
      backupInProgress: false,
      recoveryInProgress: false,
      recoveryErrorCode: ERRORS.NONE,
    };
  }

  /**
   * Dispatches the BackupUI:InitWidget custom event upon being attached to the
   * DOM, which registers with BackupUIChild for BackupService state updates.
   */
  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(
      new CustomEvent("BackupUI:InitWidget", { bubbles: true })
    );

    // If we have a backup file, but not the associated info, fetch the info
    if (
      this.backupServiceState?.backupFileToRestore &&
      !this.backupServiceState?.backupFileInfo
    ) {
      this.getBackupFileInfo();
    }

    this.addEventListener("BackupUI:SelectNewFilepickerPath", this);

    // Resize the textarea when the window is resized
    if (this.aboutWelcomeEmbedded) {
      this._handleWindowResize = () => this.resizeTextarea();
      window.addEventListener("resize", this._handleWindowResize);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._handleWindowResize) {
      window.removeEventListener("resize", this._handleWindowResize);
      this._handleWindowResize = null;
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    // Resize the textarea. This only runs once on initial render,
    // and once each time one of our reactive properties is changed.
    if (this.aboutWelcomeEmbedded) {
      this.resizeTextarea();
    }

    if (changedProperties.has("backupServiceState")) {
      // If we got a recovery error, recoveryInProgress should be false
      const inProgress =
        this.backupServiceState.recoveryInProgress &&
        !this.backupServiceState.recoveryErrorCode;

      this.dispatchEvent(
        new CustomEvent("BackupUI:RecoveryProgress", {
          bubbles: true,
          composed: true,
          detail: { recoveryInProgress: inProgress },
        })
      );
    }
  }

  handleEvent(event) {
    if (event.type == "BackupUI:SelectNewFilepickerPath") {
      let { path, iconURL } = event.detail;
      this._fileIconURL = iconURL;
      this.getBackupFileInfo(path);
    }
  }

  async handleChooseBackupFile() {
    this.dispatchEvent(
      new CustomEvent("BackupUI:ShowFilepicker", {
        bubbles: true,
        composed: true,
        detail: {
          win: window.browsingContext,
          filter: "filterHTML",
          displayDirectoryPath: this.backupServiceState?.backupFileToRestore,
        },
      })
    );
  }

  getBackupFileInfo(pathToFile = null) {
    let backupFile = pathToFile || this.backupServiceState?.backupFileToRestore;
    if (!backupFile) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("BackupUI:GetBackupFileInfo", {
        bubbles: true,
        composed: true,
        detail: {
          backupFile,
        },
      })
    );
  }

  handleCancel() {
    this.dispatchEvent(
      new CustomEvent("dialogCancel", {
        bubbles: true,
        composed: true,
      })
    );
  }

  handleConfirm() {
    let backupFile = this.backupServiceState?.backupFileToRestore;
    if (!backupFile || this.backupServiceState?.recoveryInProgress) {
      return;
    }
    let backupPassword = this.passwordInput?.value;
    this.dispatchEvent(
      new CustomEvent("BackupUI:RestoreFromBackupFile", {
        bubbles: true,
        composed: true,
        detail: {
          backupFile,
          backupPassword,
        },
      })
    );
  }

  handleTextareaResize() {
    this.resizeTextarea();
  }

  /**
   * Resizes the textarea to adjust to the size of the content within
   */
  resizeTextarea() {
    const target = this.filePicker;
    if (!target) {
      return;
    }

    const hasValue = target.value && !!target.value.trim().length;

    target.style.height = "auto";
    if (hasValue) {
      target.style.height = target.scrollHeight + "px";
    }
  }

  applyContentCustomizations() {
    if (this.aboutWelcomeEmbedded) {
      this.style.setProperty("--button-group-justify-content", "flex-start");
      this.style.setProperty("--label-font-weight", "600");
    }
  }

  controlsTemplate() {
    let iconURL = this.#placeholderFileIconURL;
    if (
      this.backupServiceState?.backupFileToRestore &&
      !this.aboutWelcomeEmbedded
    ) {
      iconURL = this._fileIconURL || this.#placeholderFileIconURL;
    }
    return html`
      <fieldset id="backup-restore-controls">
        <fieldset id="backup-filepicker-controls">
          <label
            id="backup-filepicker-label"
            for="backup-filepicker-input"
            data-l10n-id="restore-from-backup-filepicker-label"
          ></label>
          <div
            id="backup-filepicker"
            class=${this.aboutWelcomeEmbedded ? "aw-embedded-filepicker" : ""}
          >
            ${this.inputTemplate(iconURL)}
            <moz-button
              id="backup-filepicker-button"
              @click=${this.handleChooseBackupFile}
              data-l10n-id="restore-from-backup-file-choose-button"
              aria-controls="backup-filepicker-input"
            ></moz-button>
          </div>

          ${!this.backupServiceState?.backupFileInfo
            ? html`<a
                id="restore-from-backup-no-backup-file-link"
                slot="support-link"
                is="moz-support-link"
                support-page="todo-backup"
                data-l10n-id="restore-from-backup-no-backup-file-link"
              ></a>`
            : null}
          ${this.backupServiceState?.backupFileInfo
            ? html`<p
                id="restore-from-backup-backup-found-info"
                data-l10n-id="backup-file-creation-date-and-device"
                data-l10n-args=${JSON.stringify({
                  machineName:
                    this.backupServiceState.backupFileInfo.deviceName ?? "",
                  date: this.backupServiceState.backupFileInfo.date
                    ? new Date(
                        this.backupServiceState.backupFileInfo.date
                      ).getTime()
                    : 0,
                })}
              ></p>`
            : null}
        </fieldset>

        <fieldset id="password-entry-controls">
          ${this.backupServiceState?.backupFileInfo?.isEncrypted
            ? this.passwordEntryTemplate()
            : null}
        </fieldset>
      </fieldset>
    `;
  }

  inputTemplate(iconURL) {
    const styles = styleMap(
      iconURL ? { backgroundImage: `url(${iconURL})` } : {}
    );
    const backupFileName = this.backupServiceState?.backupFileToRestore || "";

    if (this.aboutWelcomeEmbedded) {
      return html`
        <textarea
          id="backup-filepicker-input"
          rows="1"
          readonly
          .value=${backupFileName}
          style=${styles}
          @input=${this.handleTextareaResize}
        ></textarea>
      `;
    }

    return html`
      <input
        id="backup-filepicker-input"
        type="text"
        readonly
        .value=${backupFileName}
        style=${styles}
      />
    `;
  }

  passwordEntryTemplate() {
    const isInvalid = this.isIncorrectPassword;
    const describedBy = isInvalid
      ? "backup-password-error"
      : "backup-password-description";

    return html` <fieldset id="backup-password">
      <label id="backup-password-label" for="backup-password-input">
        <span
          id="backup-password-span"
          data-l10n-id="restore-from-backup-password-label"
        ></span>
        <input
          type="password"
          id="backup-password-input"
          aria-invalid=${String(isInvalid)}
          aria-describedby=${describedBy}
        />
      </label>
      ${isInvalid
        ? html`
            <span
              id="backup-password-error"
              class="field-error"
              data-l10n-id="backup-service-error-incorrect-password"
            >
              <a
                id="backup-incorrect-password-support-link"
                slot="support-link"
                is="moz-support-link"
                support-page="todo-backup"
                data-l10n-name="incorrect-password-support-link"
              ></a>
            </span>
          `
        : html`<label
            id="backup-password-description"
            data-l10n-id="restore-from-backup-password-description"
          ></label> `}
    </fieldset>`;
  }

  contentTemplate() {
    let buttonL10nId = !this.backupServiceState?.recoveryInProgress
      ? "restore-from-backup-confirm-button"
      : "restore-from-backup-restoring-button";

    return html`
      <div
        id="restore-from-backup-wrapper"
        aria-labelledby="restore-from-backup-header"
        aria-describedby="restore-from-backup-description"
      >
        ${this.aboutWelcomeEmbedded ? null : this.headerTemplate()}
        <main id="restore-from-backup-content">
          ${this.backupServiceState?.recoveryErrorCode
            ? this.errorTemplate()
            : null}
          ${!this.aboutWelcomeEmbedded &&
          this.backupServiceState?.backupFileInfo
            ? this.descriptionTemplate()
            : null}
          ${this.controlsTemplate()}
        </main>

        <moz-button-group id="restore-from-backup-button-group">
          ${this.aboutWelcomeEmbedded ? null : this.cancelButtonTemplate()}
          <moz-button
            id="restore-from-backup-confirm-button"
            @click=${this.handleConfirm}
            type="primary"
            data-l10n-id=${buttonL10nId}
            ?disabled=${!this.backupServiceState?.backupFileToRestore ||
            this.backupServiceState?.recoveryInProgress}
          ></moz-button>
        </moz-button-group>
      </div>
    `;
  }

  headerTemplate() {
    return html`
      <h1
        id="restore-from-backup-header"
        class="heading-medium"
        data-l10n-id="restore-from-backup-header"
      ></h1>
    `;
  }

  cancelButtonTemplate() {
    return html`
      <moz-button
        id="restore-from-backup-cancel-button"
        @click=${this.handleCancel}
        data-l10n-id="restore-from-backup-cancel-button"
      ></moz-button>
    `;
  }

  descriptionTemplate() {
    let { date } = this.backupServiceState?.backupFileInfo || {};
    let dateTime = date && new Date(date).getTime();
    return html`
      <moz-message-bar
        id="restore-from-backup-description"
        type="info"
        data-l10n-id="restore-from-backup-description-with-metadata"
        data-l10n-args=${JSON.stringify({
          date: dateTime,
        })}
      >
        <a
          id="restore-from-backup-learn-more-link"
          slot="support-link"
          is="moz-support-link"
          support-page="todo-backup"
          data-l10n-id="restore-from-backup-support-link"
        ></a>
      </moz-message-bar>
    `;
  }

  errorTemplate() {
    // We handle incorrect password errors in the password input
    if (this.isIncorrectPassword) {
      return null;
    }

    return html`
      <moz-message-bar
        id="restore-from-backup-error"
        type="error"
        data-l10n-id=${getErrorL10nId(
          this.backupServiceState?.recoveryErrorCode
        )}
      >
      </moz-message-bar>
    `;
  }

  render() {
    this.applyContentCustomizations();
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/backup/restore-from-backup.css"
      />
      ${this.contentTemplate()}
    `;
  }
}

customElements.define("restore-from-backup", RestoreFromBackup);
