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
		thoughts: ['Σκέφτομαι...',
			'Αναζητώ την απάντηση...',
			'Ευθυγράμμιση δεδομένων...',
			'Ο Zen επεξεργάζεται...'],
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
		thoughts: ['Thinking...',
			'Seeking answers...',
			'Aligning data...',
			'Zen is processing...'],
		image_prompt_default: "Analyze this image.",
		file_prefix: "🖼️ (File: ",
		file_suffix: "): ",
		error_server: "❌ Server Error:",
		error_network: "❌ Network Error:",
		thought_prefix: "Thought:"
	}
};

// --- ΑΥΤΟΜΑΤΗ ΑΝΙΧΝΕΥΣΗ ΓΛΩΣΣΑΣ ΣΥΣΤΗΜΑΤΟΣ ---
const getSystemLanguage = () => {
	const lang = navigator.language || navigator.userLanguage;
	// Αν η γλώσσα ξεκινάει από 'el', επέλεξε ελληνικά, αλλιώς αγγλικά
	return lang.startsWith('el') ? 'el': 'en';
};

const currentLang = getSystemLanguage();
const langData = i18n[currentLang];

// --- DOM ELEMENTS ---
const promptsContainer = document.querySelector('.prompt-list');
const searchInput = document.getElementById('search');
const askButton = document.getElementById('ask');
const imageButton = document.getElementById('image');
const fileInput = document.getElementById('image-upload');

// --- HELPER FUNCTIONS ---

function initialize() {
	const randomPlaceholder = langData.placeholders[Math.floor(Math.random() * langData.placeholders.length)];
	searchInput.placeholder = randomPlaceholder;
}

function applyTheme(theme) {
	let targetTheme = theme;

	// Αν ο χρήστης ζήτησε "system", ελέγχουμε τις προτιμήσεις του συστήματος
	if (theme === 'system') {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		targetTheme = prefersDark ? 'dark': 'light';
	}

	// Εφαρμογή στο root στοιχείο (HTML) μέσω data-attribute (προτείνεται)
	document.documentElement.setAttribute('data-theme', targetTheme);

	// Εναλλακτικά, αν δουλεύεις με κλάσεις, μπορείς να κάνεις:
	// if (targetTheme === 'dark') {
	//     document.body.classList.add('dark-theme');
	// } else {
	//     document.body.classList.remove('dark-theme');
	// }

	// Αποθήκευση στο localStorage για να παραμένει η επιλογή στο refresh
	localStorage.setItem('oxyzen-theme', theme);
}


function createThoughtDiv(text) {
	const thoughtDiv = document.createElement('div');
	thoughtDiv.className = 'thought';
	thoughtDiv.innerHTML = `<strong>${langData.thought_prefix}</strong> ${text}`;
	return thoughtDiv;
}

function parseResponse(fullText) {
	const thoughtRegex = /<div class="thought">([\s\S]*?)<\/div>/;
	const match = fullText.match(thoughtRegex);

	let thoughtText = match ? match[1].trim(): null;
	let answerText = fullText.replace(thoughtRegex, '').trim();

	return {
		thoughtText,
		answerText
	};
}

const toBase64 = file => new Promise((resolve, reject) => {
	const reader = new FileReader();
	reader.readAsDataURL(file);
	reader.onload = () => resolve(reader.result.split(',')[1]);
	reader.onerror = error => reject(error);
});

// --- CORE LOGIC ---

// client.js - Ενημερωμένη sendChat για υποστήριξη λήψης και αποστολής εικόνων

async function sendChat(prompt, imageData = null, mimeType = null) {
	const outputLi = document.createElement('li');
	outputLi.id = 'loading';
	outputLi.className = 'bot-response';
	outputLi.innerHTML = langData.thoughts[Math.floor(Math.random() * langData.thoughts.length)];
	promptsContainer.appendChild(outputLi);
	promptsContainer.scrollTo(0, promptsContainer.scrollHeight);

	try {
		// Κατασκευή του body. Ο server περιμένει "images" ως array
		const body = {
			prompt,
			history: historyArray,
			images: imageData ? [imageData]: null,
			// Πίνακας με την base64
			mimeType: mimeType
		};

		const response = await fetch('/api/chat', {
			// Χρήση του ενοποιημένου endpoint
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		if (data.error) {
			outputLi.innerHTML = `${langData.error_server} ${data.error}`;
		} else {
			const {
				thoughtText,
				answerText
			} = parseResponse(data.text);

			outputLi.innerHTML = `<p>${answerText}</p>`;
			
			let functionState = null;
			let dataState = null;

			if (data.openUrl) {
				functionState = "NAVIGATE";
				dataState = data.openUrl;
			}

			if (data.setTheme) {
				functionState = "THEME";
				dataState = data.setTheme;
			}

			if (data.setToolbarPosition) {
				functionState = "TOOLBAR";
				dataState = data.setToolbarPosition;
			}

			if (data.searchUrlTemplate) {
				functionState = "SEARCH_ENGINE";
				dataState = data.searchUrlTemplate;
			}

			if (data.addTitle) {
				functionState = "BOOKMARK";
				dataState = data.addUrl;
			}

			if (data.removeTitle) {
				functionState = "REMOVE_BOOKMARK";
				dataState = data.removeTitle;
			}

			// Εμφάνιση Εικόνων αν υπάρχουν (Από Image Generation)
			if (data.images && data.images.length > 0) {
				data.images.forEach(img => {
					const imgEl = document.createElement('img');
					imgEl.src = `data:${img.mimeType};base64,${img.data}`;
					imgEl.className = 'output-image';
					outputLi.appendChild(imgEl);
				});
			}

			if (thoughtText) {
				outputLi.prepend(createThoughtDiv(thoughtText));
			}

			// Ενημέρωση ιστορικού
			historyArray.push({
				role: "user", parts: [{
					text: prompt
				}]
			});
			historyArray.push({
				role: "model", parts: [{
					text: answerText
				}]
			});
			window.parent.postMessage({
				type: "OZON_ASSISTANT_RESPONSE",
				data: {
					text: answerText,
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
	userLi.innerHTML = `${langData.file_prefix}${file.name}${langData.file_suffix}<br>${prompt}`;
	promptsContainer.appendChild(userLi);

	sendChat(prompt, base64Image, file.type);
	fileInput.value = "";
});

initialize();
