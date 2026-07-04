// public/client.js

// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless
const historyArray = [];

// --- INTERNATIONALIZATION (i18n) ---
const i18n = {
el: {
	placeholders: [
		'Πες μου τη γνώμη σου...',
		'Τι σε απασχολεί σήμερα;',
		'Αναζήτησε την εσωτερική σου γαλήνη...',
		'Πες μου για την ημέρα σου...',
		'Μοιράσου τις βαθύτερες σκέψεις σου...'
	],
	thoughts: [
		'Σκέφτομαι...',
		'Αναζητώ την απάντηση...',
		'Ευθυγράμμιση δεδομένων...',
		'Ο Zen επεξεργάζεται...'
	],
	image_prompt_default: "Ανάλυσε αυτήν την εικόνα.",
	file_prefix: "🖼️ (Αρχείο: ",
	file_suffix: "): ",
	error_server: "❌ Σφάλμα Διακομιστή:",
	error_network: "❌ Σφάλμα Δικτύου:",
	thought_prefix: "Σκέψη:"
},
en: {
	placeholders: [
		'Tell me your thoughts...',
		'What is on your mind today?',
		'Seek your inner peace...',
		'Tell me about your day...',
		'Share your deepest reflections...'
	],
	thoughts: [
		'Thinking...',
		'Seeking answers...',
		'Aligning data...',
		'Zen is processing...'
	],
	image_prompt_default: "Analyze this image.",
	file_prefix: "🖼️ (File: ",
	file_suffix: "): ",
	error_server: "❌ Server Error:",
	error_network: "❌ Network Error:",
	thought_prefix: "Thought:"
}
};

// Ανίχνευση γλώσσας (προεπιλογή el)
const userLang = navigator.language.startsWith('el') ? 'el': 'en';
const langData = i18n[userLang];

// --- DOM ELEMENTS ---
const promptsContainer = document.querySelector('.prompt-list');
const searchInput = document.getElementById('search');
const askButton = document.getElementById('ask');
const imageButton = document.getElementById('image');
const fileInput = document.getElementById('image-upload');

// --- INITIALIZATION ---
function initialize() {
// Τυχαίο placeholder
const randomPlaceholder = langData.placeholders[Math.floor(Math.random() * langData.placeholders.length)];
searchInput.placeholder = randomPlaceholder;
}

// Μετατροπή αρχείου σε Base64
function toBase64(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.readAsDataURL(file);
reader.onload = () => resolve(reader.result);
reader.onerror = error => reject(error);
});
}

// --- CORE CHAT FUNCTION ---
async function sendChat(prompt, base64Image = null, fileName = null) {
// Δημιουργία Li για την απάντηση (Loading State)
const outputLi = document.createElement('li');
outputLi.className = 'assistant-response';
outputLi.id = 'loading';

const randomThought = langData.thoughts[Math.floor(Math.random() * langData.thoughts.length)];
outputLi.innerHTML = `<div class="thought">${randomThought}</div>`;
promptsContainer.appendChild(outputLi);
promptsContainer.scrollTo(0, promptsContainer.scrollHeight);

try {
// Προετοιμασία payload
const payload = {
prompt: prompt,
history: historyArray
};

if (base64Image) {
payload.image = base64Image;
}

// Κλήση στο API του Server
const response = await fetch('/api/chat', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify(payload)
});

const data = await response.json();

if (!response.ok) {
outputLi.innerHTML = `${langData.error_server} ${data.error || 'Unknown Error'}`;
return;
}

// Εμφάνιση απάντησης στο UI
outputLi.innerHTML = data.text;

// Ενημέρωση ιστορικού (μόνο αν δεν υπάρχει σφάλμα)
historyArray.push({
role: 'user', content: base64Image ? `${langData.file_prefix}${fileName}${langData.file_suffix}${prompt}`: prompt
});
historyArray.push({
role: 'model', content: data.text
});

// --- ΕΔΩ ΓΙΝΕΤΑΙ Η ΔΙΟΡΘΩΣΗ ΓΙΑ ΤΟ POSTMESSAGE ---
let functionState = null;
let dataState = null;

// 1. Έλεγχος αν ο server στέλνει έτοιμη και δομημένη τη λειτουργία
if (data.function && data.data) {
functionState = data.function;
dataState = data.data;
}
// 2. Fallbacks για τις παλιές παραμέτρους (Theme & Search Engine)
else if (data.setTheme) {
functionState = "THEME";
dataState = data.setTheme;
} else if (data.setSearchEngine) {
functionState = "SEARCH_ENGINE";
dataState = data.setSearchEngine;
}
// 3. Νέα Προσθήκη για την Κλίμακα (Scale)
else if (data.setScale !== undefined && data.setScale !== null) {
functionState = "SCALE";
dataState = String(data.setScale);
}

// Αποστολή του μηνύματος στον Parent Browser (index.js)
if (window.parent) {
window.parent.postMessage({
type: 'OZON_ASSISTANT_RESPONSE',
data: {
text: data.text,
token: data.token,
data: dataState,
function: functionState
}
}, "*");
}

} catch (error) {
outputLi.innerHTML = `${langData.error_network} ${error.message}`;
} finally {
outputLi.removeAttribute('id');
searchInput.value = "";
searchInput.disabled = false;
askButton.disabled = false;
imageButton.disabled = false;
initialize();
promptsContainer.scrollTo(0, promptsContainer.scrollHeight);
}
}

// --- EVENT LISTENERS ---

askButton.addEventListener('click', () => {
const prompt = searchInput.value.trim();
if (!prompt) return;

searchInput.disabled = true;
askButton.disabled = true;
imageButton.disabled = true;

const userLi = document.createElement('li');
userLi.className = 'user-prompt';
userLi.textContent = prompt;
promptsContainer.appendChild(userLi);

sendChat(prompt);
});

searchInput.addEventListener('keydown', (e) => {
if (e.key === 'Enter') askButton.click();
});

imageButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
const file = fileInput.files[0];
if (!file) return;

const prompt = searchInput.value.trim() || langData.image_prompt_default;
const base64Image = await toBase64(file);

const userLi = document.createElement('li');
userLi.className = 'user-prompt';
userLi.textContent = `${langData.file_prefix}${file.name}${langData.file_suffix}${prompt}`;
promptsContainer.appendChild(userLi);

searchInput.disabled = true;
askButton.disabled = true;
imageButton.disabled = true;

sendChat(prompt, base64Image, file.name);
fileInput.value = ""; // Reset το input
});

// Εκκίνηση κατά τη φόρτωση
initialize();
