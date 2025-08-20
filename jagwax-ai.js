const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const persist = require('node-persist');

// ---- CONFIGURABLE CONTACTS ----
// Add WhatsApp numbers here to allow pairing for those contacts
// Example: '2348012345678': 'JagX1234'
let contacts = {}; // phoneNumber: pairingCode

// ---- MOTIVATIONAL QUOTES ----
const quotes = [
    "Success is not final, failure is not fatal: It is the courage to continue that counts.",
    "Dream big and dare to fail.",
    "Push yourself, because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
    "You are capable of amazing things!"
];

// ---- STORAGE INIT ----
async function initStorage() {
    await persist.init({ dir: './jagwax-storage' });
}

// ---- VIEW-ONCE & DELETED MESSAGE STORAGE ----
async function saveDeletedMessage(chatId, msg) {
    let deleted = await persist.getItem('deleted') || {};
    if (!deleted[chatId]) deleted[chatId] = [];
    deleted[chatId].push({ body: msg.body, from: msg.author || msg.from, time: Date.now() });
    await persist.setItem('deleted', deleted);
}
async function saveViewOnceMedia(chatId, media) {
    let vo = await persist.getItem('viewonce') || {};
    if (!vo[chatId]) vo[chatId] = [];
    vo[chatId].push(media);
    await persist.setItem('viewonce', vo);
}
async function getDeletedMessages(chatId) {
    let deleted = await persist.getItem('deleted') || {};
    return deleted[chatId] || [];
}
async function getViewOnceMedia(chatId) {
    let vo = await persist.getItem('viewonce') || {};
    return vo[chatId] || [];
}

// ---- PAIRING CODE GENERATION ----
function generatePairingCode(phoneNumber) {
    const digits = Math.floor(1000 + Math.random() * 9000);
    const code = `JagX${digits}`;
    contacts[phoneNumber] = code;
    return code;
}

// ---- MENU ----
function getMenu() {
    return `🤖 *Jagwax AI Bot Menu* 🤖
1. *.vv* - Resend view-once media
2. *.menu* - Show this menu
3. *.motivate* - Get a motivational quote
4. *.recover* - Recover deleted messages
5. *.groupinfo* - Show group info
6. *.pair* - Generate pairing code for your WhatsApp number
7. *.status* - View or react to statuses
8. *.welcome* - Activate welcome messages in group
9. *.addcontact <number>* - (Owner only) Add pairing contact
10. *.mycode* - See your pairing code
11. *.help* - Show help and commands
*More features coming soon!*
`;
}

// ---- GROUP FEATURES ----
function sendWelcomeMessage(groupChat, user) {
    groupChat.sendMessage(`👋 Welcome @${user}! Jagwax AI is here for you. Type *.menu* to see all features.`, { mentions: [user] });
}

// ---- OWNER CHECK ----
function isOwner(msg) {
    // Change to your WhatsApp number for admin features
    return msg.fromMe;
}

// ---- MAIN BOT ----
(async () => {
    await initStorage();

    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: { headless: true }
    });

    let sessionStart = Date.now();

    client.on('qr', qr => qrcode.generate(qr, { small: true }));

    client.on('ready', () => {
        console.log('Jagwax AI is ready!');
        // SESSION: Active for 7 days
        setTimeout(() => {
            console.log('Session expired after 7 days.');
            client.destroy();
        }, 7 * 24 * 60 * 60 * 1000);
    });

    // DELETED MESSAGE HANDLER
    client.on('message_revoke_everyone', async (after, before) => {
        if (before) await saveDeletedMessage(before.from, before);
        const chat = await before.getChat();
        chat.sendMessage(`Deleted message from ${before.author || before.from}: "${before.body}"`);
    });

    // MESSAGE HANDLER
    client.on('message', async msg => {
        const chat = await msg.getChat();
        const sender = msg.from;
        const command = msg.body.trim().split(' ')[0].toLowerCase();

        // -- Save view-once media
        if (msg.isViewOnce && msg.hasMedia) {
            const media = await msg.downloadMedia();
            await saveViewOnceMedia(sender, media);
        }

        // -- Commands
        switch (command) {
            case '.menu':
                msg.reply(getMenu());
                break;
            case '.motivate':
                msg.reply(quotes[Math.floor(Math.random() * quotes.length)]);
                break;
            case '.vv':
                const mediaList = await getViewOnceMedia(sender);
                if (mediaList.length === 0) msg.reply('No saved view-once media yet.');
                else for (const media of mediaList) msg.reply(new MessageMedia(media.mimetype, media.data, media.filename || 'viewonce'));
                break;
            case '.recover':
                const deleted = await getDeletedMessages(sender);
                if (deleted.length === 0) msg.reply('No deleted messages saved.');
                else for (const d of deleted) msg.reply(`Recovered: ${d.body}`);
                break;
            case '.pair':
                if (!contacts[sender]) {
                    const code = generatePairingCode(sender);
                    msg.reply(`Your Jagwax AI pairing code is: ${code}\nEnter this on the pairing site.`);
                } else {
                    msg.reply(`Your pairing code is: ${contacts[sender]}`);
                }
                break;
            case '.mycode':
                if (contacts[sender]) msg.reply(`Your pairing code: ${contacts[sender]}`);
                else msg.reply('No pairing code found. Use *.pair* to generate.');
                break;
            case '.groupinfo':
                if (chat.isGroup) msg.reply(`Group Name: ${chat.name}\nParticipants: ${chat.participants.length}`);
                else msg.reply('This command works in groups only.');
                break;
            case '.welcome':
                if (chat.isGroup) {
                    msg.reply('Welcome messages activated. New members will be greeted.');
                    // Note: whatsapp-web.js does not emit participant_added, needs polling workaround
                } else {
                    msg.reply('This command works in groups only.');
                }
                break;
            case '.status':
                msg.reply('Status features are limited by WhatsApp API. Auto-reaction is enabled.');
                break;
            case '.help':
                msg.reply(getMenu());
                break;
            case '.addcontact':
                if (isOwner(msg)) {
                    const phone = msg.body.split(' ')[1];
                    if (phone) {
                        const code = generatePairingCode(phone);
                        msg.reply(`Contact ${phone} added. Pairing code: ${code}`);
                    } else msg.reply('Usage: *.addcontact <number>*');
                } else msg.reply('Only owner can add contacts.');
                break;
        }

        // -- PAIRING CODE CONFIRMATION
        if (msg.body.startsWith('JagX')) {
            if (contacts[sender] && msg.body === contacts[sender]) {
                msg.reply('Jagwaz has successfully taken over');
            } else {
                msg.reply('Invalid pairing code.');
            }
        }

        // --- GROUP FEATURES: (TODO: Welcome, group admin tools, anti-delete, etc.)

        // --- STATUS REACTOR (TODO: API limitations, stub only) ---
        // whatsapp-web.js does not support full status APIs yet.
        // But you could implement polling or notification hack here.

        // --- MORE FEATURES CAN BE ADDED BELOW ---
        // .broadcast, .reminder, .quoteoftheday, .admin, etc.
    });

    client.initialize();
})();
