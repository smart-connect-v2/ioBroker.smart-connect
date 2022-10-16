const deviceTypes = [
    'room-light',
    'light',
    'shutter',
    'window-opener',
    'plug',
    'presence-sensor',
    'bed-occupancy-sensor',
    'door-sensor',
    'entrance-door-sensor',
    'climate-sensor',
    'brightness-sensor',
    'wireless-switch',
    'valve',
    'fan',
    'speed-test',
    'music-server',
    'window-tilted-sensor',
    'window-opened-sensor',
    'routine',
    'nuki-opener',
    'switch',
    'nuki-lock',
    'readonly-plug',
] as const;

export type SupportedDeviceType = typeof deviceTypes[number];

export const isSupportedDeviceType = (type: string): type is SupportedDeviceType => {
    return deviceTypes.includes(type as SupportedDeviceType);
};

type Device = {
    id: string;
    name?: string;
    roomName?: string;
    type: SupportedDeviceType;
};

export default Device;
