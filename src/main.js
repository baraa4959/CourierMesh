import {getConfig} from './config.js';
import {openStore} from './store.js';
import {createHttp} from './http.js';
import {smtpServer} from './smtp.js';
import {createWorker} from './worker.js';
let config,store,http,smtp,stop;
try{config=getConfig();store=openStore(config);http=createHttp(store,config);smtp=smtpServer(store,config);stop=createWorker(store,config).start();console.info(JSON.stringify({service:'couriermesh',state:'started',httpPort:config.httpPort,smtpPort:config.smtpEnabled?config.smtpPort:null,requireStarttls:config.smtpRequireTls}));}
catch(e){console.error('CourierMesh failed to start:',e.message);process.exit(1);}
function shutdown(){stop?.();http?.close();smtp?.close();setTimeout(()=>{store?.close();process.exit(0);},250).unref();}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
