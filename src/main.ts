/*
 * Created with @iobroker/create-adapter v2.3.0
 */
import * as utils from '@iobroker/adapter-core';

import Device, { isSupportedDeviceType, SupportedDeviceType } from './lib/types/device';
import Server from './server';

class SmartConnect extends utils.Adapter {
    private server = null as Server | null;
    private rootPath = '';
    private stateSubscriptions = new Map<string, Set<(value: any) => void>>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'smart-connect',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private _verifyPath = (path: string): void => {
        const isValid = path.startsWith(this.rootPath);
        if (!isValid) {
            throw new Error('Invalid path');
        }
    };

    private async _getDevices(): Promise<Device[]> {
        const objects = Object.values(
            await this.getForeignObjectsAsync(/*this.rootPath ? `${this.rootPath}.*` : */ '*'),
        );

        return objects
            .filter(({ type, common: { role } }) => type === 'channel' && role && isSupportedDeviceType(role))
            .map(({ _id, common, enums = {} }) => {
                const roomName = Object.entries(enums).find(([enumId]) => enumId.startsWith('enum.rooms.'))?.[1];

                return {
                    id: _id,
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    name: common.name as string,
                    type: common.role as SupportedDeviceType,
                    roomName,
                };
            });
    }

    private async _getState(id: string): Promise<any> {
        this._verifyPath(id);

        const state = await this.getForeignStateAsync(id);
        if (!state) {
            throw new Error(`State ${id} not found`);
        }

        return state.val;
    }

    private async _setState(id: string, value: any): Promise<void> {
        this._verifyPath(id);

        await this.setForeignStateAsync(id, {
            val: value,
        });
    }

    private async _subscribeState(id: string, callback: (value: any) => void): Promise<void> {
        this._verifyPath(id);

        let subscriptions = this.stateSubscriptions.get(id);
        if (!subscriptions) {
            subscriptions = new Set([callback]);
            this.stateSubscriptions.set(id, subscriptions);
            await this.subscribeForeignStatesAsync(id);
        } else {
            subscriptions.add(callback);
        }
    }

    private async _unsubscribeState(id: string, callback: (value: any) => void): Promise<void> {
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

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        const { users, ip, port, rootPath, sessionSecret, allowedOrigins } = this.config;

        this.rootPath = rootPath;

        if (!sessionSecret) {
            this.log.error('Session secret is not set');
            throw new Error('Session secret is not set');
        }

        this.log.info(`Starting backend with ${users.length} users on ${ip}:${port}...`);
        this.log.info(`Root path: ${rootPath}`);

        const privateOrigins = allowedOrigins.filter((origin) => origin.private).map((origin) => origin.origin);
        const publicOrigins = allowedOrigins.filter((origin) => !origin.private).map((origin) => origin.origin);

        if (!privateOrigins.length && !publicOrigins.length) {
            this.log.warn('No allowed origins are set');
        } else {
            this.log.info(
                `Allowed origins: ${(privateOrigins.length ? privateOrigins : ['-']).join(
                    ', ',
                )} (private), ${(publicOrigins.length ? publicOrigins : ['-']).join(', ')} (public)`,
            );
        }
        this.server = new Server(
            users,
            sessionSecret,
            {
                getDevices: this._getDevices.bind(this),
                getState: this._getState.bind(this),
                setState: this._setState.bind(this),
                subscribeState: this._subscribeState.bind(this),
                unsubscribeState: this._unsubscribeState.bind(this),
            },
            {
                private: privateOrigins,
                public: publicOrigins,
            },
        );

        try {
            await this.server.listen(port, ip);
            this.log.info('Backend started');
        } catch (e: any) {
            this.log.error(`Could not start backend: ${e?.message || e}`);
            throw e;
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.server?.close();
        } catch (e) {
        } finally {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new SmartConnect(options);
} else {
    (() => new SmartConnect())();
}
