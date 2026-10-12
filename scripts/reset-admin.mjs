import { getConfig } from '../src/config.js';
import { openStore } from '../src/store.js';
// Run only in an authenticated server terminal. Never paste the output in support chats.
const store = openStore(getConfig());
try {
  const password = store.account.reset();
  console.log(`Administrator credentials reset.\nUsername: admin\nTemporary password: ${password}\nChange it on the first login.`);
} finally { store.close(); }
