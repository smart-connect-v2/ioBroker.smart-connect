"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_device = require("./lib/types/device");
var import_server = __toESM(require("./server"));
class SmartConnect extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "smart-connect"
    });
    this.server = null;
    this.rootPath = "";
    this.stateSubscriptions = /* @__PURE__ */ new Map();
    this._verifyPath = (path) => {
      const isValid = path.startsWith(this.rootPath);
      if (!isValid) {
        throw new Error("Invalid path");
      }
    };
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async _getDevices() {
    const objects = Object.values(await this.getForeignObjectsAsync(this.rootPath ? `*` : "*", "channel"));
    return objects.filter(({ type, common: { role } }) => type === "channel" && role && (0, import_device.isSupportedDeviceType)(role)).map(({ _id, common, enums = {} }) => {
      var _a;
      const roomName = (_a = Object.entries(enums).find(([enumId]) => enumId.startsWith("enum.rooms."))) == null ? void 0 : _a[1];
      return {
        id: _id,
        name: common.name,
        type: common.role,
        roomName
      };
    });
  }
  async _getState(id) {
    this._verifyPath(id);
    const state = await this.getForeignStateAsync(id);
    if (!state) {
      throw new Error(`State ${id} not found`);
    }
    return state.val;
  }
  async _setState(id, value) {
    this._verifyPath(id);
    await this.setForeignStateAsync(id, {
      val: value
    });
  }
  async _subscribeState(id, callback) {
    this._verifyPath(id);
    let subscriptions = this.stateSubscriptions.get(id);
    if (!subscriptions) {
      subscriptions = /* @__PURE__ */ new Set([callback]);
      this.stateSubscriptions.set(id, subscriptions);
      await this.subscribeForeignStatesAsync(id);
    } else {
      subscriptions.add(callback);
    }
  }
  async _unsubscribeState(id, callback) {
    this._verifyPath(id);
    const subscriptions = this.stateSubscriptions.get(id);
    if (!subscriptions) {
      throw new Error(`No subscriptions for ${id}`);
    }
    subscriptions.delete(callback);
    if (!subscriptions.size) {
      this.stateSubscriptions.delete(id);
      await this.unsubscribeForeignStatesAsync(id);
    }
  }
  async onReady() {
    const { users, ip, port, rootPath, sessionSecret, allowedOrigins } = this.config;
    this.rootPath = rootPath;
    if (!sessionSecret) {
      this.log.error("Session secret is not set");
      throw new Error("Session secret is not set");
    }
    this.log.info(`Starting backend with ${users.length} users on ${ip}:${port}...`);
    this.log.info(`Root path: ${rootPath}`);
    const privateOrigins = allowedOrigins.filter((origin) => origin.private).map((origin) => origin.origin);
    const publicOrigins = allowedOrigins.filter((origin) => !origin.private).map((origin) => origin.origin);
    if (!privateOrigins.length && !publicOrigins.length) {
      this.log.warn("No allowed origins are set");
    } else {
      this.log.info(
        `Allowed origins: ${(privateOrigins.length ? privateOrigins : ["-"]).join(
          ", "
        )} (private), ${(publicOrigins.length ? publicOrigins : ["-"]).join(", ")} (public)`
      );
    }
    this.server = new import_server.default(
      users,
      sessionSecret,
      {
        getDevices: this._getDevices.bind(this),
        getState: this._getState.bind(this),
        setState: this._setState.bind(this),
        subscribeState: this._subscribeState.bind(this),
        unsubscribeState: this._unsubscribeState.bind(this)
      },
      {
        private: privateOrigins,
        public: publicOrigins
      }
    );
    try {
      await this.server.listen(port, ip);
      this.log.info("Backend started");
    } catch (e) {
      this.log.error(`Could not start backend: ${(e == null ? void 0 : e.message) || e}`);
      throw e;
    }
  }
  onUnload(callback) {
    var _a;
    try {
      (_a = this.server) == null ? void 0 : _a.close();
    } catch (e) {
    } finally {
      callback();
    }
  }
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new SmartConnect(options);
} else {
  (() => new SmartConnect())();
}
//# sourceMappingURL=main.js.map
