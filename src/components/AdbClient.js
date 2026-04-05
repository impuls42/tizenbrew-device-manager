import { invoke } from "@tauri-apps/api/core";

class AdbClient {
    constructor(ip, context) {
        this.ip = ip;
        this.connectionHandler = null;
        this.context = context;
    }

    async connect() {
        await invoke('connect', { ip: this.ip });
        await this.getSystemInfo();
        window.onbeforeunload = async () => {
            await this.disconnect();
        }
        return true;
    }

    async disconnect() {
        await invoke('disconnect');
    }

    async shell(command) {
        return await invoke('shell', { command });
    }

    async runDaemonCommand(command) {
        return await invoke('run_daemon_command', { command });
    }

    async push(fileData, destinationPath) {
        return await invoke('push', { fileData, destinationPath });
    }

    async getSystemInfo() {
        console.log('Getting system info');
        const sysinfo = await invoke('run_daemon_command', { command: 'sysinfo: ' });
        console.log(sysinfo);
        const sysData = sysinfo.split('\u0000').filter(a => a !== '');
        this.context.setDeviceInfo(sysData);

        const capabilities = await invoke('run_daemon_command', { command: 'capability: ' });
        console.log(capabilities);
        const list = capabilities.split('\n');

        for (let cap of list) {
            if (cap === '\u0000') continue;
            if (!/^[A-Za-z]/.test(cap)) {
                cap = cap.slice(2);
            }
            const capData = cap.split('\n').map(a => a.split(':'));
            const capInfo = {};
            for (const data of capData) {
                capInfo[data[0]] = data[1];
                this.context.setDeviceCapabilities(capInfo);
            }
        }
    }

}

export default AdbClient;