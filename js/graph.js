window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isListening = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var mediaStreamSource = null;
var detectorElem, 
	noteElem
var Liste_Freq = [];
var Compteur = 0;

// Fonction qui se lance au chargement de la page
window.onload = function() {
	detectorElem = document.getElementById( "detector" );
	noteElem = document.getElementById( "note" );
}

// Fonction qui se lance au clic sur le bouton "Start" qui lance l'écoute
function startPitchDetect() {

			isListening = true;
			audioContext = new AudioContext();
			navigator.mediaDevices.getUserMedia({"audio": "true"}).then((stream) => {
	
				mediaStreamSource = audioContext.createMediaStreamSource(stream);
				analyser = audioContext.createAnalyser();
				analyser.fftSize = 2048;
				mediaStreamSource.connect( analyser );
				updatePitch();

			}).catch((err) => {
				console.error(`${err.name}: ${err.message}`);
				alert("Vous devez activer votre microphone pour utiliser cette fonctionnalité.");
			});
}

// Fonction qui se lance au clic sur le bouton "Stop" qui arrête l'écoute
function stopListening() {

	sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = true;
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start( 0 );
    isListening = true;
    isLiveInput = false;

    if (isListening) {
		document.getElementById("startButton").innerText = "Start";
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isListening = false;
		noteElem.innerText = "--";
		
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );

        return "Stop";
    }
}


var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Float32Array( buflen );


// Fonction qui permet de détecter la fréquence du son capté par le microphone
function autoCorrelate( buf, sampleRate ) {
	// Implements the ACF2+ algorithm
	var SIZE = buf.length;
	var rms = 0;

	for (var i=0;i<SIZE;i++) {
		var val = buf[i];
		rms += val*val;
	}
	rms = Math.sqrt(rms/SIZE);
	if (rms<0.01) // not enough signal
		return -1;

	var r1=0, r2=SIZE-1, thres=0.2;
	for (var i=0; i<SIZE/2; i++)
		if (Math.abs(buf[i])<thres) { r1=i; break; }
	for (var i=1; i<SIZE/2; i++)
		if (Math.abs(buf[SIZE-i])<thres) { r2=SIZE-i; break; }

	buf = buf.slice(r1,r2);
	SIZE = buf.length;

	var c = new Array(SIZE).fill(0);
	for (var i=0; i<SIZE; i++)
		for (var j=0; j<SIZE-i; j++)
			c[i] = c[i] + buf[j]*buf[j+i];

	var d=0; while (c[d]>c[d+1]) d++;
	var maxval=-1, maxpos=-1;
	for (var i=d; i<SIZE; i++) {
		if (c[i] > maxval) {
			maxval = c[i];
			maxpos = i;
		}
	}
	var T0 = maxpos;

	var x1=c[T0-1], x2=c[T0], x3=c[T0+1];
	a = (x1 + x3 - 2*x2)/2;
	b = (x3 - x1)/2;
	if (a) T0 = T0 - b/(2*a);

	return sampleRate/T0;
}


// Fonction qui permet de mettre à jour la fréquence détectée
function updatePitch() {
	analyser.getFloatTimeDomainData( buf );
	var ac = autoCorrelate( buf, audioContext.sampleRate );

 	if (ac == -1) {
 		detectorElem.className = "vague";
		noteElem.innerText = "--";
		rafID = window.requestAnimationFrame( updatePitch );
 	} 
	
	else {
	 	detectorElem.className = "confident";
	 	pitch = ac;
		if (pitch > 40 && pitch < 1000){
	 		noteElem.innerText = Math.round( pitch )+ " Hz";
			 Liste_Freq.push([((Liste_Freq.length)/60).toFixed(2), Math.round( pitch )]);

		}
		
		if (Liste_Freq.length > document.getElementById("Duree").value*60) { //60 pour 1s
			stopListening();
			createGraph();
		}
		else 
			rafID = window.requestAnimationFrame( updatePitch );
		
	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
}


// Fonction qui permet de créer un graphique avec la librairie AnyChart
function createGraph(){
	var div = document.createElement("div");
	div.id = "Graph"+Compteur;

	div.style = "width: 500px; height: 400px; margin: 0 auto; background-color: #fff; border: 1px solid #ccc; border-radius: 3px; padding: 10px; margin-bottom: 10px; margin-top: 30px;";
	div.style.paddingBottom = 1.5+"em";
	div.innerText = "Moyenne de la fréquence : "+smart_average().toFixed(2)+" Hz";
	document.body.appendChild(div);
	anychart.onDocumentReady(function () {

		var data = Liste_Freq;
		var dataSet = anychart.data.set(data);
		var firstSeriesData = dataSet.mapAs({x: 0, value: 1});
		var chart = anychart.line();
		var firstSeries = chart.line(firstSeriesData);
		
		chart.title("Fréquence en fonction du temps");
		chart.xAxis().title("Temps (s)");
    	chart.yAxis().title("Fréquence (Hz)");

		chart.container(div.id);
		chart.maxHeight(400);
		chart.maxWidth(500);

		chart.draw();
		Liste_Freq = [];

	});
	Compteur++;
}

// Fonction qui permet de calculer la moyenne des fréquences détectées (en enlevant les valeurs aberrantes)
function smart_average(){

	liste_des_frequences = []
	for(var i = 0; i < Liste_Freq.length; i++){
		liste_des_frequences.push(Liste_Freq[i][1]);
	}

	var freq = [] ;
	
	var liste_de_liste_freq = [];

	liste_des_frequences.sort();

	len=liste_des_frequences.length;

	for (var i=0;  i<len; i++) {
		for (var j=0; j<len; j++) {
			if (liste_des_frequences[j] >= liste_des_frequences[i]-5 && liste_des_frequences[j] <= liste_des_frequences[i]+5) {
				freq.push(liste_des_frequences[j]);
				}
		}
		liste_de_liste_freq.push(freq);
		freq = [];
	}

	var position = 0;
	len = liste_de_liste_freq.length;

	for (var i=0; i<len; i++) {
		if (liste_de_liste_freq[i].length > liste_de_liste_freq[position].length) 
			position = i;
	}

	var sum = 0;
	len = liste_de_liste_freq[position].length;

	for (var i=0; i<len; i++) {
		sum += liste_de_liste_freq[position][i];
	}

	var avg = sum / (liste_de_liste_freq[position]).length;

	return avg;
}

// Fonction qui permet de supprimer tous les graphiques
function ClearGraph(){
	for (var i = 0; i < Compteur; i++) {
		var div = document.getElementById("Graph"+i);
		div.parentNode.removeChild(div);
	}
	Compteur = 0;
}

// Fonction qui lance lorsque l'utilisateur clique sur le bouton "Start/Stop"
function startButton() {
	if(!isListening){
		startPitchDetect();
		document.getElementById("startButton").innerText = "Stop";
	}
	
	else{
		stopListening();
		document.getElementById("startButton").innerText = "Start";
	}
}