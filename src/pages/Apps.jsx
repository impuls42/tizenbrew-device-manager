import { useContext, useEffect, useState } from "react";
import { GlobalContext } from "../components/GlobalContext";
import { CodeBracketSquareIcon, PlayIcon, TrashIcon } from "@heroicons/react/24/outline";
import Modal from "../components/Modal.jsx";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import Throbber from "../components/Throbber.jsx";
import { useNavigate } from "react-router";

export default function Apps() {
    const [apps, setApps] = useState([]);
    const { state } = useContext(GlobalContext);
    const [modalOpened, setModalOpened] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [resultMessage, setResultMessage] = useState(null);
    const navigate = useNavigate();

    if (!state.deviceClient) {
        navigate('/');
        return null;
    }

    useEffect(() => {
        async function getApps() {
            const data = await state.deviceClient?.shell('0 vd_applist');
            const list = data.toString().split('\n').slice(2).join('\n').split('---------------------------------------------------------------------------------------------').filter(a => a != '');
            for (let i = 0; i < list.length; i++) {
                list[i] = list[i].replace(/--------------/g, '').replace(/-------------/g, '').replace(/\s+=/g, '=').replace(/[\r]/g, '');
            }
            list.pop();
            for (const app of list) {
                if (app === '\n') continue;
                const appData = app.split('\n').map(a => a.split('='));
                const appInfo = {};
                for (const data of appData) {
                    appInfo[data[0]] = data[1];
                }
                setApps((prev) => [...prev, appInfo]);
            }
        }

        getApps();
    }, [null]);

    return (
        <div className="bg-white dark:bg-slate-900" style={{ height: '100vh', position: 'absolute' }} id="content">
            <Modal opened={resultMessage !== null} setOpened={() => setResultMessage(null)} title="Result">
                {resultMessage}
            </Modal>
            <Modal opened={modalOpened} setOpened={setModalOpened} title="Install An App">
                <div className="mt-4">
                    <input type="file" id="app-file" className="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-violet-700 hover:file:bg-blue-700 file:text-white" accept=".wgt,.tpk" />
                </div>
                <div className="mt-4 flex justify-end">
                    <button className={`${installing ? 'bg-gray-800' : 'bg-blue-700 dark:bg-blue-600'} hover:bg-blue-700 text-white font-bold py-2 px-4 rounded`}
                        onClick={async () => {
                            const file = document.getElementById('app-file').files[0];
                            if (!file) return setResultMessage('Please select a file first.');

                            const reader = new FileReader();
                            reader.onload = async () => {
                                const blob = new Blob([reader.result]);
                                const read = new BlobReader(blob);
                                let zip;
                                try {
                                    zip = new ZipReader(read);
                                } catch (e) {
                                    setResultMessage(`There was an error reading the file: ${e}`);
                                }
                                const entries = await zip.getEntries();
                                const app = entries.find(e => e.filename === 'config.xml' || e.filename === 'tizen-manifest.xml');
                                if (!app) return setResultMessage('The file does not contain a valid Tizen app.');
                                const textWriter = new TextWriter();
                                const appInfo = await app.getData(textWriter);
                                const parser = new DOMParser();
                                const xmlDoc = parser.parseFromString(appInfo, "text/xml");
                                const manifest = xmlDoc.querySelector('manifest');
                                let id;
                                if (!manifest) {
                                    const widget = xmlDoc.getElementsByTagName('tizen:application')[0];
                                    id = widget.getAttribute('id');
                                } else {
                                    id = manifest.getAttribute('package');
                                }

                                if (!id) return setResultMessage('The app does not have a valid package ID.');

                                const array = new Uint8Array(reader.result);

                                try {
                                    setInstalling(true);
                                    await state.deviceClient?.push(array, `/home/owner/share/tmp/sdk_tools/${file.name}`);
                                    //await new Promise(r => setTimeout(r, 5000));
                                    const result = await state.deviceClient?.shell(`0 vd_appinstall ${id} /home/owner/share/tmp/sdk_tools/${file.name}`);
                                    const lastLines = result.split('\n').slice(-8).join('\n');
                                    setInstalling(false);
                                    setResultMessage(lastLines);
                                } catch (e) {
                                    setResultMessage(`There was an error installing the app: ${e}`);
                                }
                            }

                            reader.readAsArrayBuffer(file);
                        }}>
                        {installing ? <Throbber /> : null}
                        Install
                    </button>
                </div>
            </Modal>
            <a className="absolute text-balance text-5xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 ml-6 mt-8">Apps</a>
            <div className="flex flex-wrap mt-[8rem]">
                <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded ml-6"
                    onClick={async () => {
                        setModalOpened(true);
                    }}>
                    Install App
                </button>
            </div>
            <div className="flex flex-wrap overflow-y-auto mt-4" style={{ height: 'calc(100vh - 18rem)' }}>
                {apps.map((app, index) => (
                    <div key={index} className="w-full p-4">
                        <div className="bg-white dark:bg-slate-700 rounded-lg shadow-lg p-4 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {app['app_title']} ({app['app_version'] !== '' ? app['app_version'] : '?'})
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{app['app_tizen_id']}</p>
                            </div>
                            <div className="flex space-x-2">
                                <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    onClick={async () => {
                                        setResultMessage(await state.deviceClient?.shell(`0 was_execute ${app['app_id']}`));
                                    }}>
                                    <PlayIcon width="1.5rem" />
                                </button>
                                {Number(app['app_index']) >= 300 ?
                                    <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        onClick={async () => {
                                            try {
                                                const res = await state.deviceClient?.shell(`0 debug ${app['app_tizen_id']}`);
                                                setResultMessage(res || '(empty response)');
                                            } catch (e) {
                                                setResultMessage(`Error: ${e}`);
                                            }
                                        }}>
                                        <CodeBracketSquareIcon width="1.5rem" />
                                    </button>
                                    : null}
                                <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    onClick={async () => {
                                        setResultMessage(await state.deviceClient?.shell(`0 vd_appuninstall ${app['app_id']}`));
                                    }}>
                                    <TrashIcon width="1.5rem" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}