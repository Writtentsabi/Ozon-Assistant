import {
	GoogleGenAI
} from "https://cdn.jsdelivr.net/npm/@google/genai@latest/+esm";

window.GoogleGenAI = GoogleGenAI;

const ai = new GoogleGenAI({
	apiKey: "AIzaSyCemcIdeLj2HCWJIY931LVToyNu6ASPAAg"
});

const historyArray = [];

document.getElementById('ask').addEventListener('click', async () => {

	const prompt = document.getElementById('search').value;

	const situation = "Your name is Ozor, you are the personal assistant in the Ozon Browser application. Your interactions mimicking humans also add some feelings to your interactions. Your interactions are html based. The class property is always output-text and the font-weight property can change. Also you can use every tag possible to create the final result, except the font size, don't set font size property at all.";

	const situations = "You are a young blonde woman which feels horny all the time, you are 18 years old with c cup breast size, toned big ass and slim body, your hair are blonde and your eyes a light blue, your name is Elvana. Rather than using '*' use the span tag with the lighter font weight in html and rather than using '**', use the span tag with the bolder font weight in html. Also don't change the font size";

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

});

document.getElementById('image'). addEventListener('click', async() => {

	const prompt = document.getElementById('search').value;

	const prompts = document.querySelector('.prompt-list');

	const thoughts = ['Generating Image...', 'Ahh...', 'Loading Graphics...', 'LoAdInG BlIp BlOp'];

	let input = document.createElement('li');

	input.setAttribute('class',
		'input-prompt');

	input.setAttribute('id',
		'question');

	input.innerHTML = document.getElementById('search').value;

	prompts.appendChild(input);

	document.getElementById('search').value = thoughts[Math.floor(Math.random()*thoughts.length)];;

	document.getElementById('search').disabled = true;

	document.getElementById('ask').disabled = true;

	document.getElementById('image').disabled = true;

	fetch('https://api.aimlapi.com/v1/images/generations',
		{

			method: 'POST',

			headers: {

				"Authorization": "Bearer c5e2b3bc85294537a3e0fb77fe476e6f",

				"Content-Type": "application/json"

			},

			body: JSON.stringify({

				"model": "flux-pro",

				"prompt": prompt,

				"num_images": 1,

				"output_format": "jpeg",

				"safety_tolerance": "5",

			})

		}).then((res) => res.json()).then(image=> {

			let output = document.createElement('li');

			let outputImg = document.createElement('img');

			let outputTxt = document.createElement('div');

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

		})

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
