"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var device_exports = {};
__export(device_exports, {
  isSupportedDeviceType: () => isSupportedDeviceType
});
module.exports = __toCommonJS(device_exports);
const deviceTypes = [
  "room-light",
  "light",
  "shutter",
  "window-opener",
  "plug",
  "presence-sensor",
  "bed-occupancy-sensor",
  "door-sensor",
  "entrance-door-sensor",
  "climate-sensor",
  "brightness-sensor",
  "wireless-switch",
  "valve",
  "fan",
  "speed-test",
  "music-server",
  "window-tilted-sensor",
  "window-opened-sensor",
  "routine",
  "nuki-opener",
  "switch",
  "nuki-lock",
  "readonly-plug"
];
const isSupportedDeviceType = (type) => {
  return deviceTypes.includes(type);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isSupportedDeviceType
});
//# sourceMappingURL=device.js.map
