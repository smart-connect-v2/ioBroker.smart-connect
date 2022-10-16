"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_crypto = __toESM(require("crypto"));
var import_express = __toESM(require("express"));
var import_express_rate_limit = __toESM(require("express-rate-limit"));
var import_express_session = __toESM(require("express-session"));
var import_express_validator = require("express-validator");
var import_express_ws = __toESM(require("express-ws"));
class Server {
  constructor(users, sessionSecret, handlers, allowdOrigins) {
    this.app = (0, import_express_ws.default)((0, import_express.default)()).app;
    this.httpServer = null;
    this.users = users;
    this.sessionSecret = sessionSecret;
    this.app.use((err, req, res, _next) => {
      console.error(err);
      res.status(500).send("Internal Server Error");
    });
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (!origin || req.method !== "OPTIONS") {
        return next();
      }
      const isPrivate = req.headers["Access-Control-Request-Private-Network"] === "true";
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (isPrivate) {
        if (allowdOrigins.private.includes(origin)) {
          res.setHeader("Access-Control-Allow-Private-Network", "true");
        }
      }
      const allowedOrigins = [...allowdOrigins.private, ...allowdOrigins.public];
      if (allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
      return next();
    });
    this.app.use(
      (0, import_express_session.default)({
        secret: this.sessionSecret
      })
    );
    this.app.use(import_express.default.json());
    this.app.use(
      "/login",
      (0, import_express_rate_limit.default)({
        windowMs: 5 * 60 * 1e3,
        max: 5
      })
    );
    this.app.get("/", (req, res) => {
      res.json({
        discover: "smart-connect",
        serviceID: "iobroker.smart-connect",
        serviceVersion: "1.0.0",
        serviceName: "Smart Connect ioBroker Backend"
      });
    });
    this.app.post("/login", (0, import_express_validator.body)("username").isString(), (0, import_express_validator.body)("password").isString(), (req, res) => {
      const { username, password } = req.body;
      let validUser = null;
      for (const user of this.users) {
        if (user.username.length !== username.length || user.password.length !== password.length) {
          continue;
        }
        const userNameMatches = import_crypto.default.timingSafeEqual(Buffer.from(user.username), Buffer.from(username));
        const passwordMatches = import_crypto.default.timingSafeEqual(Buffer.from(user.password), Buffer.from(password));
        if (userNameMatches && passwordMatches) {
          validUser = user;
        }
      }
      if (validUser) {
        req.session.user = validUser;
        res.status(200).send("OK");
      } else {
        res.status(400).send("Invalid credentials");
      }
    });
    this.app.post("/logout", (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          res.status(500).send("Internal Server Error");
        } else {
          res.status(200).send("OK");
        }
      });
    });
    this.app.use((req, res, next) => {
      const nonSecureRoutes = ["/login", "/logout", "/"];
      if (req.session.user || nonSecureRoutes.includes(req.path)) {
        return next();
      }
      res.status(401).send("Unauthorized");
    });
    this.app.get("/devices", async (req, res) => {
      if (Object.keys(req.query).length) {
        res.status(400).send("Query parameters are not supported");
        return;
      }
      res.status(200).json(await handlers.getDevices());
    });
    this.app.get(
      "/state",
      (0, import_express_validator.query)("id").isString().exists().matches(/([a-z0-9]*\.)*[a-z0-9]+$/),
      async (req, res) => {
        const errors = (0, import_express_validator.validationResult)(req);
        if (!errors.isEmpty()) {
          res.status(400).send("Bad request");
          return;
        }
        const { id } = req.query;
        try {
          res.status(200).json({
            value: await handlers.getState(id)
          });
        } catch (err) {
          res.status(400).send((err == null ? void 0 : err.message) || "Bad request");
        }
      }
    );
    this.app.post(
      "/state",
      (0, import_express_validator.query)("id").isString().exists().matches(/([a-z0-9]*\.)*[a-z0-9]+$/),
      (0, import_express_validator.body)("value").exists(),
      async (req, res) => {
        const errors = (0, import_express_validator.validationResult)(req);
        if (!errors.isEmpty()) {
          res.status(400).send("Bad request");
          return;
        }
        const { id } = req.query;
        const { value } = req.body;
        try {
          await handlers.setState(id, value);
          res.status(200).send("OK");
        } catch (err) {
          res.status(400).send((err == null ? void 0 : err.message) || "Bad request");
        }
      }
    );
    this.app.ws("/", async (ws) => {
      const subscriptions = /* @__PURE__ */ new Map();
      ws.on("message", async (msg) => {
        let data;
        try {
          data = JSON.parse(msg);
        } catch (err) {
          ws.send(
            JSON.stringify({
              error: "Invalid JSON"
            })
          );
          return;
        }
        const { type, id, uuid } = data;
        if (!id) {
          ws.send(
            JSON.stringify({
              error: "Missing id"
            })
          );
          return;
        }
        if (!uuid) {
          ws.send(
            JSON.stringify({
              error: "Missing uuid"
            })
          );
        }
        if (type === "subscribe") {
          try {
            const cb = (value) => {
              ws.send(
                JSON.stringify({
                  id,
                  value,
                  uuid
                })
              );
            };
            await handlers.subscribeState(id, cb);
            subscriptions.set(uuid, cb);
          } catch (e) {
            ws.send(
              JSON.stringify({
                error: (e == null ? void 0 : e.message) || "Internal Server Error",
                uuid
              })
            );
          }
        } else if (type === "unsubscribe") {
          const cb = subscriptions.get(uuid);
          if (!cb) {
            throw new Error("No subscription found");
          }
          await handlers.unsubscribeState(id, cb);
        } else {
          ws.send(
            JSON.stringify({
              error: "Invalid message",
              uuid
            })
          );
        }
      });
    });
  }
  listen(port, ip) {
    return new Promise((resolve, reject) => {
      this.app.addListener("error", reject);
      this.httpServer = this.app.listen(port, ip, () => {
        resolve();
        this.app.removeListener("error", reject);
      });
    });
  }
  close() {
    var _a;
    (_a = this.httpServer) == null ? void 0 : _a.close();
  }
}
var server_default = Server;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
//# sourceMappingURL=server.js.map
