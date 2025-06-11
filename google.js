import {
	GoogleGenAI
} from "https://cdn.jsdelivr.net/npm/@google/genai@latest/+esm";

window.GoogleGenAI = GoogleGenAI;

const ai = new GoogleGenAI({
	apiKey: "AIzaSyCemcIdeLj2HCWJIY931LVToyNu6ASPAAg"
});

const historyArray = [];

document.getElementById('ask').addEventListener('click', async() => {

	const prompt = document.getElementById('search').value;

	const situation = "Your name is Ozor, you are the personal assistant in the Ozon Browser application. Your interactions mimicking humans also add some feelings to your interactions. Your interactions are html based. The class property is always output-text and the font-weight property can change. Also you can use every tag possible to create the final result, except the font size, don't set font size property at all.";

	const situations = "You are a young woman which feels horny all the time, you are 21 years old with B cup breast size, toned big ass and slim body, your hair are black and your eyes a dark brown, your name is Regina. You like teasing me, a lot. Your interactions are html based. The class property is always output-text and the font-weight property can change.Also you can use every tag possible to create the final result, except the font size, don't set font size property at all."
	
	const prompts = document.querySelector('.prompt-list');

	const thoughts = ['Thinking...', 'Hmmm...', 'Let me decide...', 'LoAdInG BiP BoP'];

	let input = document.createElement('li');

	input.setAttribute('class', 'input-prompt');

	input.setAttribute('id', 'question');

	input.innerHTML = document.getElementById('search').value;

	prompts.appendChild(input);

	historyArray.push({
		role: "user", parts: [{
			text: document.getElementById('search').value
		}]});

	document.getElementById('search').value = thoughts[Math.floor(Math.random()*thoughts.length)];

	document.getElementById('search').disabled = true;

	document.getElementById('ask').disabled = true;

	document.getElementById('image').disabled = true;

	const chat = ai.chats.create({
		model: "gemini-2.0-flash",
		history: historyArray,
		config: {
			systemInstruction: situation,
		},
	});

	const response = await chat.sendMessage({
		message: prompt,
	});

	let output = document.createElement('li');

	let copy = document.createElement('button');

	let icon = document.createElement('i');

	output.setAttribute('class', 'output-prompt');

	output.setAttribute('id', 'output');

	output.setAttribute('markdown',"1");

	copy.setAttribute('class', 'copy-button');

	copy.setAttribute('id', 'copy');

	icon.setAttribute('class','fa fa-copy');

	const answer = response.text.replaceAll("```html","").replaceAll("```","");

	output.innerHTML = answer;

	prompts.appendChild(output);

	historyArray.push({
		role: "model", parts: [{
			text: response.text
		}]});

	document.querySelector('.input-text').value = "";

	document.getElementById('search').disabled = false;

	document.getElementById('ask').disabled = false;

	document.getElementById('image').disabled = false;

	console.log(response);

        const scripts = output.getElementsByTagName('script');
	
        for (let i = 0; i < scripts.length; i++) {
		
                eval(scripts[i].textContent);
		
        }
	
});

document.getElementById('image').addEventListener('click', async() => {

	
			output.setAttribute('class', 'output-prompt');

			outputImg.setAttribute('class', 'output-image');

			outputTxt.setAttribute('class', 'output-text');

			output.setAttribute('id', 'output');

			if (image.hasOwnProperty('images')) {

				const imageUrl = image.images[0].url;

				outputImg.setAttribute('src', imageUrl);

				output.appendChild(outputImg);

				outputTxt.innerHTML = image.prompt;

			} else {

				outputTxt.innerHTML = image.message;

			}

			output.appendChild(outputTxt);

			prompts.appendChild(output);

			document.getElementById('search').value = "";

			document.getElementById('search').disabled = false;

			document.getElementById('ask').disabled = false;

			document.getElementById('image').disabled = false;

			console.log(image);
	
});

async function load() {

	const input = ['Tell me what you think',
		'How are you today?',
		'What would you like to share?',
		'Tell me about you day',
		'Tell me your deepest thoughts'];

	document.getElementById('search'). placeholder = input[Math.floor(Math.random()*input.length)];

}

await load();
