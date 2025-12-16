// public/client.js 
 
// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless (δεν θυμάται) 
const historyArray = [];  
  
// 1. Βρες τα DOM στοιχεία 
const askButton = document.getElementById('ask'); 
const searchInput = document.getElementById('search'); 
const promptsContainer = document.querySelector('.prompt-list'); 
const imageButton = document.getElementById('image'); 
// ΝΕΟ: Input File Element
const imageUploadInput = document.getElementById('image-upload');
  
const thoughts = ['Thinking...', 'Hmmm...', 'Let me decide...', 'LoAdInG BiP BoP']; 
  
  
// 2. Συνάρτηση Εκκίνησης 
function initialize() { 
    const input = [ 
        'Πες μου τη γνώμη σου', 
        'Πώς είσαι σήμερα;', 
        'Τι θα ήθελες να μοιραστείς;', 
        'Πες μου για την ημέρα σου', 
        'Πες μου τις βαθύτερες σκέψεις σου' 
    ]; 
    if (searchInput) { 
        searchInput.placeholder = input[Math.floor(Math.random() * input.length)]; 
    } 
} 
  
// *** ΝΕΑ ΛΟΓΙΚΗ ΓΙΑ ΤΟ IMAGE BUTTON ***
// Όταν πατηθεί το κουμπί εικόνας, κάνε κλικ στο κρυφό input file
imageButton.addEventListener('click', () => { 
    imageUploadInput.click();
}); 


// *** ΝΕΑ ΛΟΓΙΚΗ: Όταν επιλεγεί αρχείο ***
imageUploadInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Εμφάνιση ερωτήματος (με το όνομα του αρχείου)
    const promptText = searchInput.value || "Ανάλυσε αυτήν την εικόνα.";
    let inputLi = document.createElement('li'); 
    inputLi.setAttribute('class', 'input-prompt'); 
    inputLi.innerHTML = `🖼️ (Αρχείο: ${file.name}): ${promptText}`; 
    promptsContainer.appendChild(inputLi);

    // --- 1. Διαβάζουμε το αρχείο ως Base64 ---
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1]; // Αφαίρεση του "data:..." prefix

        // --- 2. Εμφάνιση μηνύματος φόρτωσης ---
        let outputLi = document.createElement('li'); 
        outputLi.setAttribute('class', 'output-prompt'); 
        outputLi.setAttribute('id', 'output'); 
        outputLi.innerHTML = `<i class=\"fa fa-spinner fa-spin\"></i> ${thoughts[Math.floor(Math.random() * thoughts.length)]}`;
        promptsContainer.appendChild(outputLi); 

        // --- 3. Αλλαγή UI State ---
        searchInput.disabled = true;
        askButton.disabled = true;
        imageButton.disabled = true;
        
        // --- 4. Fetch to new Multimodal API ---
        try {
            const response = await fetch('/api/multimodal-chat', { // ΝΕΟ ENDPOINT
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: promptText,
                    image: base64Data,
                    mimeType: file.type,
                    history: historyArray 
                })
            });

            const data = await response.json();
            
            // --- 5. ΧΕΙΡΙΣΜΟΣ ΑΠΟΤΕΛΕΣΜΑΤΩΝ ---
            if (data.error) {
                outputLi.innerHTML = `❌ <strong>Σφάλμα Server:</strong> ${data.error}`;
            } else {
                // Εμφάνιση της εικόνας που στάλθηκε για επιβεβαίωση
                let imagePreview = document.createElement('img');
                imagePreview.src = reader.result; // Χρησιμοποιούμε το πλήρες DataURL
                imagePreview.style.maxWidth = '100px'; 
                imagePreview.style.borderRadius = '5px';
                imagePreview.style.marginBottom = '10px';
                
                
                // Προσθήκη απάντησης στο ιστορικό
                historyArray.push({ role: "user", parts: [{ text: promptText, inlineData: { mimeType: file.type, data: base64Data } }] });
                historyArray.push({ role: "model", parts: [{ text: data.text }] });

                // Ενημέρωση της απάντησης στην οθόνη
                outputLi.innerHTML = data.text;
                outputLi.prepend(imagePreview); // Τοποθετούμε την εικόνα πριν το κείμενο
            }

        } catch (error) {
            console.error('Fetch/Multimodal Error:', error);
            outputLi.innerHTML = `❌ <strong>Σφάλμα Δικτύου:</strong> ${error.message}`;
        } finally {
            // --- 6. Επαναφορά UI State ---
            searchInput.value = "";
            searchInput.disabled = false;
            askButton.disabled = false;
            imageButton.disabled = false;
            outputLi.removeAttribute('id'); 
            promptsContainer.scrollTo(0, promptsContainer.scrollHeight);
            imageUploadInput.value = null; // Καθαρισμός του input file
            initialize();
        }
    };
});
  
// *** ΛΟΓΙΚΗ CHAT (ΠΑΡΑΜΕΝΕΙ) ***
// 3. Λογική Κλικ για Chat
askButton.addEventListener('click', async () => { 
  
    const prompt = searchInput.value; 
    if (!prompt) return; 
  
    // --- 1. Εμφάνιση ερωτήματος χρήστη (DOM Logic) --- 
    let inputLi = document.createElement('li'); 
    inputLi.setAttribute('class', 'input-prompt'); 
    inputLi.innerHTML = prompt; 
    promptsContainer.appendChild(inputLi); 
    
    // --- 2. Εμφάνιση μηνύματος φόρτωσης (DOM Logic) --- 
    let outputLi = document.createElement('li'); 
    outputLi.setAttribute('class', 'output-prompt'); 
    outputLi.setAttribute('id', 'output'); 
    outputLi.innerHTML = `<i class=\"fa fa-spinner fa-spin\"></i> ${thoughts[Math.floor(Math.random() * thoughts.length)]}`;
    promptsContainer.appendChild(outputLi); 
    
    // --- 3. Αλλαγή UI State ---
    searchInput.disabled = true;
    askButton.disabled = true;
    imageButton.disabled = true;

    // --- 4. Fetch the Chat API ---
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                prompt: prompt,
                history: historyArray 
            })
        });

        const data = await response.json();

        // 5. ΧΕΙΡΙΣΜΟΣ ΑΠΟΤΕΛΕΣΜΑΤΩΝ (DOM Logic)
        if (data.error) {
            outputLi.innerHTML = `❌ <strong>Σφάλμα Server:</strong> ${data.error}`;
        } else {
            // Προσθήκη απάντησης στο ιστορικό
            historyArray.push({ role: "user", parts: [{ text: prompt }] });
            historyArray.push({ role: "model", parts: [{ text: data.text }] });

            // Ενημέρωση της απάντησης στην οθόνη
            outputLi.innerHTML = data.text;
        }

    } catch (error) {
        console.error('Fetch/Chat Error:', error);
    } finally {
        // --- 5. Επαναφορά UI State ---
        searchInput.value = "";
        searchInput.disabled = false;
        askButton.disabled = false;
        imageButton.disabled = false;
        outputLi.removeAttribute('id'); // Αφαιρούμε το ID από την τελευταία απάντηση
        promptsContainer.scrollTo(0, promptsContainer.scrollHeight); // Scroll to bottom
        initialize(); // Επαναφορά placeholder
    }
});
  
// 5. Λογική Enter Key 
searchInput.addEventListener('keydown', (event) => { 
    if (event.key === 'Enter') { 
        if (imageButton.disabled) return;
        askButton.click();
    } 
}); 
  
// 6. Εκκίνηση 
initialize();
