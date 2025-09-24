/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import ConditionAnd from "./and.mjs";
import ConditionOr from "./or.mjs";
import ConditionTest from "./test.mjs";
import ConditionCookie from "./cookie.mjs";
import ConditionNot from "./not.mjs";
import ConditionUrl from "./url.mjs";

const CONDITIONS_MAP = {
  and: ConditionAnd,
  test: ConditionTest,
  or: ConditionOr,
  cookie: ConditionCookie,
  not: ConditionNot,
  url: ConditionUrl,
};

export class ConditionFactory {
  #storage = {};
  #context = {};

  constructor(context = {}) {
    this.#context = context || {};
  }

  static async run(conditionDesc, context = {}) {
    if (conditionDesc === undefined) {
      return true;
    }

    const factory = new ConditionFactory(context);

    const condition = await factory.create(conditionDesc);

    await condition.init();

    return condition.check();
  }

  create(conditionDesc) {
    const conditionClass = CONDITIONS_MAP[conditionDesc.type];
    if (!conditionClass) {
      throw new Error("Unknown condition type: " + String(conditionDesc?.type));
    }
    return new conditionClass(this, conditionDesc);
  }

  storeData(key, value) {
    this.#storage[key] = value;
  }

  retrieveData(key) {
    return this.#storage[key];
  }

  get context() {
    return this.#context;
  }
}
