// public/client.js 
  
// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless (δεν θυμάται) 
const historyArray = [];  
  
// 1. Βρες τα DOM στοιχεία 
const askButton = document.getElementById('ask'); 
const searchInput = document.getElementById('search'); 
const promptsContainer = document.querySelector('.prompt-list'); 
const imageButton = document.getElementById('image'); // Υποθέτουμε ότι υπάρχει 
  
const thoughts = ['Thinking...', 'Hmmm...', 'Let me decide...', 'LoAdInG BiP BoP']; 
  
  
// 2. Συνάρτηση Εκκίνησης (αντικαθιστά την παλιά async function load()) 
function initialize() { 
    const input = [ 
        'Tell me what you think', 
        'How are you today?', 
        'What would you like to share?', 
        'Tell me about you day', 
        'Tell me your deepest thoughts' 
    ]; 
    // Θέτει placeholder για το πεδίο αναζήτησης 
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
  
    // --- 3. UI State Changes (Απενεργοποίηση, Placeholder) --- 
    searchInput.value = thoughts[Math.floor(Math.random() * thoughts.length)]; 
    searchInput.disabled = true; 
    askButton.disabled = true; 
    imageButton.disabled = true; 
  
    try { 
        // --- 4. FETCH CALL (Στέλνει τα δεδομένα στον SERVER) --- 
        const response = await fetch('/api/chat', { // To endpoint για Chat
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({  
                prompt: prompt, 
                history: historyArray  
            }) 
        }); 
  
        // ------------------ ΕΝΙΣΧΥΜΕΝΟΣ ΕΛΕΓΧΟΣ ΣΦΑΛΜΑΤΩΝ (FIX) ------------------
        if (!response.ok) {
            const status = response.status;
            let errorMessage = 'Σφάλμα επικοινωνίας με τον server. Δοκιμάστε αργότερα.';

            if (status === 429) {
                errorMessage = '🛑 Υπέρβαση Ορίου Gemini API (429). Παρακαλώ περιμένετε 1-2 λεπτά και δοκιμάστε ξανά.';
            } else if (status === 500) {
                 errorMessage = '⚠️ Ο server αντιμετώπισε ένα εσωτερικό σφάλμα. Ελέγξτε τα logs του Render.';
            } else if (status >= 400) {
                 errorMessage = `Σφάλμα ${status}. Το αίτημα απέτυχε.`;
            }

            // Εμφάνιση του σφάλματος ως απάντηση
            let errorLi = document.createElement('li'); 
            errorLi.setAttribute('class', 'output-prompt error-message');
            errorLi.innerHTML = errorMessage;
            promptsContainer.appendChild(errorLi);
            
            // Πετάμε σφάλμα για να παραλείψουμε το υπόλοιπο try block
            throw new Error(`HTTP error! status: ${status}`);
        }
        // ------------------ ΤΕΛΟΣ ΕΝΙΣΧΥΜΕΝΟΥ ΕΛΕΓΧΟΥ ------------------
  
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
            // Προσοχή: Το eval() είναι δυνητικά μη ασφαλές
            eval(scripts[i].textContent); 
        } 
  
    } catch (error) { 
        // Πλέον το catch πιάνει μόνο σφάλματα δικτύου, καθώς το 429/500 εμφανίστηκε ήδη.
        console.error('Fetch/Gemini Error:', error); 
    } finally { 
        // --- 8. Επαναφορά UI State --- 
        searchInput.value = ""; 
        searchInput.disabled = false; 
        askButton.disabled = false; 
        imageButton.disabled = false; 
    } 
}); 
  
// 4. Λογική Κλικ για Image (ΝΕΟ)
imageButton.addEventListener('click', async () => { 
    
    const prompt = searchInput.value; 
    if (!prompt) return; 

    // --- 1. Εμφάνιση ερωτήματος χρήστη (DOM Logic) --- 
    let inputLi = document.createElement('li'); 
    inputLi.setAttribute('class', 'input-prompt'); 
    inputLi.setAttribute('id', 'question'); 
    inputLi.innerHTML = `🖼️ **Δημιουργία Εικόνας:** ${prompt}`; 
    promptsContainer.appendChild(inputLi); 

    // --- 2. UI State Changes (Απενεργοποίηση, Placeholder) --- 
    searchInput.value = thoughts[Math.floor(Math.random() * thoughts.length)]; 
    searchInput.disabled = true; 
    askButton.disabled = true; 
    imageButton.disabled = true; 

    try { 
        // --- 3. FETCH CALL στο ΝΕΟ endpoint (Image Generation) --- 
        const response = await fetch('/api/generate-image', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({  
                prompt: prompt
            }) 
        }); 

        // ------------------ ΕΛΕΓΧΟΣ ΣΦΑΛΜΑΤΩΝ (FIX) ------------------
        if (!response.ok) {
            const status = response.status;
            let errorMessage = 'Σφάλμα επικοινωνίας με τον server κατά τη δημιουργία εικόνας.';

            if (status === 429) {
                errorMessage = '🛑 Υπέρβαση Ορίου Gemini API (429). Παρακαλώ περιμένετε 1-2 λεπτά και δοκιμάστε ξανά.';
            } else if (status === 500) {
                 errorMessage = '⚠️ Ο server αντιμετώπισε ένα εσωτερικό σφάλμα. Ελέγξτε τα logs του Render.';
            } else if (status >= 400) {
                 errorMessage = `Σφάλμα ${status}. Το αίτημα απέτυχε.`;
            }

            // Εμφάνιση του σφάλματος ως απάντηση
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

        // Δημιουργούμε το URL της εικόνας από τα Base64 δεδομένα
        const imageUrl = `data:${data.mimeType};base64,${data.image}`;
        
        let imageElement = document.createElement('img');
        imageElement.src = imageUrl;
        imageElement.alt = prompt;
        // Προσθέτουμε inline στυλ για βασική εμφάνιση
        imageElement.style.maxWidth = '100%'; 
        imageElement.style.height = 'auto'; 
        imageElement.style.borderRadius = '8px';
        imageElement.style.marginTop = '10px';

        outputLi.innerHTML = `✅ **Ορίστε η εικόνα σας:** <br>
                              *${data.text || ' (Δεν υπήρχε συνοδευτικό κείμενο) '}*`;
        outputLi.appendChild(imageElement);
        promptsContainer.appendChild(outputLi); 
        
    } catch (error) { 
        console.error('Fetch/Gemini Image Error:', error); 
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
