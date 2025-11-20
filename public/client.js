// public/client.js 
  
// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless (δεν θυμάται) 
const historyArray = [];  
  
// 1. Βρες τα DOM στοιχεία 
const askButton = document.getElementById('ask'); 
const searchInput = document.getElementById('search'); 
const promptsContainer = document.querySelector('.prompt-list'); 
const imageButton = document.getElementById('image'); 
  
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
  
// 3. Λογική Κλικ για Chat
askButton.addEventListener('click', async () => { 
  
    const prompt = searchInput.value; 
    if (!prompt) return; 
  
    // --- 1. Εμφάνιση ερωτήματος χρήστη (DOM Logic) --- 
    let inputLi = document.createElement('li'); 
    inputLi.setAttribute('class', 'input-prompt'); 
    inputLi.setAttribute('id', 'question'); 
    inputLi.innerHTML = prompt; 
    promptsContainer.appendChild(inputLi); 
  
    // --- 2. Προσθήκη ερωτήματος στο Ιστορικό --- 
    historyArray.push({ 
        role: "user", parts: [{ text: prompt }] 
    }); 
  
    // --- 3. UI State Changes --- 
    searchInput.value = thoughts[Math.floor(Math.random() * thoughts.length)]; 
    searchInput.disabled = true; 
    askButton.disabled = true; 
    imageButton.disabled = true; 
  
    try { 
        // --- 4. FETCH CALL (Chat) --- 
        const response = await fetch('/api/chat', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({  
                prompt: prompt, 
                history: historyArray  
            }) 
        }); 
  
        // ------------------ ΕΛΕΓΧΟΣ ΣΦΑΛΜΑΤΩΝ ------------------
        if (!response.ok) {
            const status = response.status;
            let errorMessage = 'Σφάλμα επικοινωνίας με τον server. Δοκιμάστε αργότερα.';

            if (status === 429) {
                errorMessage = '🛑 Υπέρβαση Ορίου Gemini API (429). Παρακαλώ περιμένετε 1-2 λεπτά και δοκιμάστε ξανά.';
            } else if (status === 500) {
                 errorMessage = '⚠️ Ο server αντιμετώπισε ένα εσωτερικό σφάλμα.';
            } else if (status === 404) {
                 errorMessage = '🚫 Σφάλμα 404: Δεν βρέθηκε το endpoint συνομιλίας στον server.';
            } else if (status >= 400) {
                 errorMessage = `Σφάλμα ${status}. Το αίτημα απέτυχε.`;
            }

            let errorLi = document.createElement('li'); 
            errorLi.setAttribute('class', 'output-prompt error-message');
            errorLi.innerHTML = errorMessage;
            promptsContainer.appendChild(errorLi);
            
            throw new Error(`HTTP error! status: ${status}`);
        }
        // ------------------ ΤΕΛΟΣ ΕΛΕΓΧΟΥ ------------------
  
        const data = await response.json(); 
        const answer = (data.text || "Δεν ελήφθη απάντηση.")
                       .replaceAll("```html", "").replaceAll("```", ""); 
  
        // --- 5. Εμφάνιση απάντησης (DOM Logic) --- 
        let outputLi = document.createElement('li'); 
        outputLi.setAttribute('class', 'output-prompt'); 
        outputLi.setAttribute('id', 'output'); 
        outputLi.innerHTML = answer; 
        promptsContainer.appendChild(outputLi); 
  
        // --- 6. Ενημέρωση Ιστορικού --- 
        historyArray.push({ 
            role: "model", parts: [{ text: data.text }] 
        }); 
  
        // --- 7. Εκτέλεση Scripts (Αν χρειάζεται) --- 
        const scripts = outputLi.getElementsByTagName('script'); 
        for (let i = 0; i < scripts.length; i++) { 
            eval(scripts[i].textContent); 
        } 
  
    } catch (error) { 
        console.error('Fetch/Gemini Error:', error); 
    } finally { 
        // --- 8. Επαναφορά UI State --- 
        searchInput.value = ""; 
        searchInput.disabled = false; 
        askButton.disabled = false; 
        imageButton.disabled = false; 
    } 
}); 
  
// 4. Λογική Κλικ για Image
imageButton.addEventListener('click', async () => { 
    
    const prompt = searchInput.value; 
    if (!prompt) return; 

    // --- 1. Εμφάνιση ερωτήματος χρήστη (DOM Logic) --- 
    let inputLi = document.createElement('li'); 
    inputLi.setAttribute('class', 'input-prompt'); 
    inputLi.setAttribute('id', 'question'); 
    inputLi.innerHTML = `🖼️ <strong>Δημιουργία Εικόνας:</strong> ${prompt}`; 
    promptsContainer.appendChild(inputLi); 

    // --- 2. UI State Changes --- 
    searchInput.value = "Creating image..."; 
    searchInput.disabled = true; 
    askButton.disabled = true; 
    imageButton.disabled = true; 

    try { 
        // --- 3. FETCH CALL στο endpoint Image Generation --- 
        const response = await fetch('/api/generate-image', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({  
                prompt: prompt
            }) 
        }); 

        // ------------------ ΕΛΕΓΧΟΣ ΣΦΑΛΜΑΤΩΝ ------------------
        if (!response.ok) {
            const status = response.status;
            let errorMessage = 'Σφάλμα επικοινωνίας με τον server κατά τη δημιουργία εικόνας.';

            if (status === 503) { 
                // Αυτό δεν θα συμβεί με το Gemini, αλλά το κρατάμε για άλλα API
                errorMessage = '🛑 Υπηρεσία απασχολημένη (Service Unavailable). Παρακαλώ δοκιμάστε ξανά.';
            } else if (status === 429) {
                 errorMessage = '🛑 Υπέρβαση Ορίου API (429). Παρακαλώ περιμένετε 1-2 λεπτά και δοκιμάστε ξανά.';
            } else if (status === 500) {
                 errorMessage = '⚠️ Ο server αντιμετώπισε ένα εσωτερικό σφάλμα.';
            } else if (status === 404) {
                 errorMessage = '🚫 Σφάλμα 404: Δεν βρέθηκε το endpoint εικόνας στον server.';
            } else if (status >= 400) {
                 errorMessage = `Σφάλμα ${status}. Το αίτημα απέτυχε.`;
            }

            let errorLi = document.createElement('li'); 
            errorLi.setAttribute('class', 'output-prompt error-message');
            errorLi.innerHTML = errorMessage;
            promptsContainer.appendChild(errorLi);
            
            throw new Error(`HTTP error! status: ${status}`);
        }
        // ------------------ ΤΕΛΟΣ ΕΛΕΓΧΟΥ ------------------

        const data = await response.json(); 
        
        // --- 4. Εμφάνιση εικόνας (DOM Logic) --- 
        let outputLi = document.createElement('li'); 
        outputLi.setAttribute('class', 'output-prompt'); 
        outputLi.setAttribute('id', 'output'); 

        // ΧΕΙΡΙΣΜΟΣ BASE64 ΔΕΔΟΜΕΝΩΝ ΑΠΟ ΤΟ GEMINI IMAGEN
        const base64Data = data.image; 
        const mimeType = data.mimeType || "image/jpeg"; 
        
        if (base64Data) {
            const imageUrl = `data:${mimeType};base64,${base64Data}`;
            
            let imageElement = document.createElement('img');
            imageElement.src = imageUrl; 
            imageElement.alt = prompt;
            imageElement.style.maxWidth = '100%'; 
            imageElement.style.height = 'auto'; 
            imageElement.style.borderRadius = '8px';
            imageElement.style.marginTop = '10px';
    
            outputLi.innerHTML = `✅ <strong>Ορίστε η εικόνα σας (μέσω Gemini Imagen):</strong> <br>
                                  <em>${data.text || ' (Δεν υπήρχε συνοδευτικό κείμενο) '}</em>`;
            outputLi.appendChild(imageElement);
        } else {
            outputLi.innerHTML = `❌ <strong>Σφάλμα:</strong> Δεν ελήφθη Base64 εικόνας από τον server.`;
        }

        promptsContainer.appendChild(outputLi); 
        
    } catch (error) { 
        console.error('Fetch/Image Error:', error); 
    } finally { 
        // --- 5. Επαναφορά UI State --- 
        searchInput.value = ""; 
        searchInput.disabled = false; 
        askButton.disabled = false; 
        imageButton.disabled = false; 
    } 
}); 
  
  
// Καλεί τη συνάρτηση εκκίνησης 
initialize();
