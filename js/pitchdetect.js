window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var DEBUGCANVAS = null;
var mediaStreamSource = null;
var detectorElem, 
	canvasElem,
	waveCanvas,
	noteElem
var FreqGraph = [];
var Compteur = 0;
var oscillator;

window.onload = function() {
	InitialisationVariables();
	audioContext = new AudioContext();
	MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));	// corresponds to a 5kHz signal

	detectorElem = document.getElementById( "detector" );
	canvasElem = document.getElementById( "output" );
	DEBUGCANVAS = document.getElementById( "waveform" );
	if (DEBUGCANVAS) {
		waveCanvas = DEBUGCANVAS.getContext("2d");
		waveCanvas.strokeStyle = "black";
		waveCanvas.lineWidth = 1;
	}
	noteElem = document.getElementById( "note" );

	detectorElem.ondragenter = function () { 
		this.classList.add("droptarget"); 
		return false; };
	detectorElem.ondragleave = function () { this.classList.remove("droptarget"); return false; };
	detectorElem.ondrop = function (e) {
  		this.classList.remove("droptarget");
  		e.preventDefault();
		theBuffer = null;

	  	var reader = new FileReader();
	  	reader.onload = function (event) {
	  		audioContext.decodeAudioData( event.target.result, function(buffer) {
	    		theBuffer = buffer;
	  		}, function(){alert("error loading!");} ); 

	  	};
	  	reader.onerror = function (event) {
	  		alert("Error: " + reader.error );
		};
	  	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	  	return false;
	};

}

function startPitchDetect() {
			// grab an audio context
			audioContext = new AudioContext();
			changeTextWithBlur("Veuillez activer votre microphone.");
			// Attempt to get audio input
			navigator.mediaDevices.getUserMedia({"audio": "true"}).then((stream) => {
				// Create an AudioNode from the stream.
				mediaStreamSource = audioContext.createMediaStreamSource(stream);
				// Connect it to the destination.
				analyser = audioContext.createAnalyser();
				analyser.fftSize = 2048;
				mediaStreamSource.connect( analyser );
				changeTextWithBlur("Veuillez taper au centre du rayon à l'aide d'un objet métallique.");
				updatePitch();
				//Add class active to the class hand
				document.getElementById("hammer").className = "hand active";

			}).catch((err) => {
				// always check for errors at the end.
				console.error(`${err.name}: ${err.message}`);
				changeTextWithBlur("Appuyez sur le bouton Start pour commencer !");
				alert("Vous devez activer votre microphone pour utiliser cette fonctionnalité.");
			});

}
function changeTextWithBlur(newText) {
	var helpingText = document.getElementById("helpingtext");
	helpingText.classList.add("text-blur"); // Apply blur effect

	setTimeout(function() {
	  helpingText.innerText = newText; // Change the text

	  setTimeout(function() {
		helpingText.classList.remove("text-blur"); // Remove blur effect
	  }, 50); // Delay before removing blur effect (500ms = 0.5s)
	}, 100); // Delay before changing the text (500ms = 0.5s)
  }

function togglePlayback() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
		document.getElementById("hammer").className = "hand inactive";
		return "Stop";
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = true;
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start( 0 );
    isPlaying = true;
    isLiveInput = false;

    updatePitch();
	document.getElementById("hammer").className = "hand inactive";
    return "Stop";
}

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Float32Array( buflen );



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

function updatePitch( time ) {
	var cycles = new Array;
	analyser.getFloatTimeDomainData( buf );
	var ac = autoCorrelate( buf, audioContext.sampleRate );

 	if (ac == -1) {
 		detectorElem.className = "vague";
		noteElem.innerText = "--";
		document.getElementById("reglage").innerText = "--";
 	} else {
	 	detectorElem.className = "confident";
	 	pitch = ac;

		if(Math.round( pitch ) > 40 && Math.round( pitch ) < 1000){
			FreqGraph.push([((FreqGraph.length)/60).toFixed(2), Math.round( pitch )]);
		}

		if (FreqGraph.length > 50) { //15 = 0.25s
		
			togglePlayback();
			togglePlayback();
			//alert("STOP EZ");
			Reglage(averagesimplified());
			updateGauge(averagesimplified());
			//change the class of noteElem to "confident"
			detectorElem.className = "confident";
			noteElem.innerText = Math.round(averagesimplified()) + " Hz";
			var parametres = VariablesInitialisees();
			console.log("parametres"+parametres);
			if(document.getElementById("reglage").innerText == "Parfait!"){
				changeTextWithBlur("Fréquence du rayon : " + noteElem.innerText + ". Félicitations, vous avez réussi à accorder votre rayon !");
			}
			else if (parametres == false){
				changeTextWithBlur("Veuillez entrer les paramètres de votre rayon dans la section correspondante.");
			}
			else{
				changeTextWithBlur("Fréquence du rayon : " + noteElem.innerText + ". Veuillez suivre les instructions ci-dessous et recommencer.");
			}
			FreqGraph = [];
			
		}
		
	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}


function averagesimplified(){

	liste_des_frequences = []
	for(var i = 0; i < FreqGraph.length; i++){
		liste_des_frequences.push(FreqGraph[i][1]);
	}

	var freq = [] ;
	
	var liste_de_liste_freq = [];

	liste_des_frequences.sort();

	len=liste_des_frequences.length;

	for (var i=0;  i<len; i++) {
		for (var j=0; j<len; j++) {
			if (liste_des_frequences[j] >= liste_des_frequences[i]-10 && liste_des_frequences[j] <= liste_des_frequences[i]+10) {
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

function VariablesInitialisees(){
	if (document.getElementById("density").value != "" && document.getElementById("LengthEntry").value != "" && document.getElementById("TenseEntry").value != "" && document.getElementById("diameter").value != ""){
		return true;
	}
	else{
		return false;
	}
}

function InitialisationVariables(){	

	if (document.getElementById("density").value != "" && document.getElementById("LengthEntry").value != "" && document.getElementById("TenseEntry").value != "" && document.getElementById("diameter").value != ""){
		document.getElementById("Tension").className = "confident";
		document.getElementById("Longueur").className = "confident";
		document.getElementById("Densité").className = "confident";
		document.getElementById("Diametre").className = "confident";
		if (document.getElementById("Mode").checked == true){
			changeTextWithBlur("Appuyez sur le bouton Start pour commencer !");
		}
		else{
			changeTextWithBlur("Appuyez sur le bouton Start afin de commencer le réglage en fonction du son émis !");
		}
		var Tension = document.getElementById("TenseEntry").value; // N
		var Longueur = document.getElementById("LengthEntry").value * 0.01; // cm to m
		var Masse_Volumique = document.getElementById("density").value * 1000; // density to kg/m3
		var Diametre = document.getElementById("diameter").value * 0.001; // mm to m
		var Masse = Masse_Volumique * Math.PI * Math.pow(Diametre,2) * Longueur / 4; // kg
		var Masse_Lineique = Masse / Longueur ; // kg/m
		var Freq = Math.round((1/(2*Longueur))*Math.sqrt(Tension/Masse_Lineique)) + 39;
		document.getElementById("FreqAim").innerText = "Fréquence à obtenir : "+(Number(Freq))+" Hz";
	}
	else {
		document.getElementById("FreqAim").innerText = "Fréquence à obtenir : N/A";
		changeTextWithBlur("Veuillez entrer les paramètres du rayon.");

		if (document.getElementById("TenseEntry").value == ""){
			document.getElementById("Tension").className = "vague";
		}
		else{document.getElementById("Tension").className = "confident";}

		if (document.getElementById("LengthEntry").value == ""){
			document.getElementById("Longueur").className = "vague";
		}
		else{document.getElementById("Longueur").className = "confident";}

		if (document.getElementById("density").value == ""){
			document.getElementById("Densité").className = "vague";
		}
		else{document.getElementById("Densité").className = "confident";}

		if (document.getElementById("diameter").value == ""){
			document.getElementById("Diametre").className = "vague";
		}
		else{document.getElementById("Diametre").className = "confident";}
	}
	
}

function Reglage(pitch){

	
	if (document.getElementById("FreqAim").innerText != "Fréquence à obtenir : N/A"){
		
		freq_theorique = Number(document.getElementById("FreqAim").innerText.split(" ")[4]);
		
		if (Number(pitch) < freq_theorique-5){
			if (Number(pitch)<freq_theorique-40){
				document.getElementById("reglage").innerText = "Serrer l'écrou de 180°";
			}
			else if (Number(pitch)<freq_theorique-15){
				document.getElementById("reglage").innerText = "Serrer l'écrou de 90°";
			}
			else if (Number(pitch)<freq_theorique-10){
				document.getElementById("reglage").innerText = "Serrer l'écrou de 45°";
			}
			else{	
				document.getElementById("reglage").innerText = "Serrer légèrement l'écrou";
			}
		}

		else if (Number(pitch) > freq_theorique+5){
			if (Number(pitch)>freq_theorique+40){
				document.getElementById("reglage").innerText = "Désserrer l'écrou de 180°";
			}
			else if (Number(pitch)>freq_theorique+15){
				document.getElementById("reglage").innerText = "Désserrer l'écrou de 90°";
			}
			else if (Number(pitch)>freq_theorique+10){
				document.getElementById("reglage").innerText = "Désserrer l'écrou de 45°";
			}
			else{	
				document.getElementById("reglage").innerText = "Désserrer légèrement l'écrou";
			}
		}
		
		else if (Number(pitch) >= freq_theorique-10 && Number(pitch) <= freq_theorique+10){
			document.getElementById("reglage").innerText = "Parfait!";
		}
		
		else{
			document.getElementById("reglage").innerText = "Réglage inconnu";
		}
		
	}
	
}

function updateGauge(frequency){
	var freqtohave = Number(document.getElementById("FreqAim").innerText.split(" ")[4]);
    var freqmax = 2*freqtohave;
	var pointer = document.getElementById("pointer");
    if(frequency < freqmax && frequency > 0){
      if(frequency>freqtohave-5 && frequency<freqtohave+5){
        pointer.style.left = "47%";
        pointer.style.backgroundColor = "green";
      }
      else{
      pointer.style.left = ((frequency/freqmax)*100)-3 + "%";
      pointer.style.backgroundColor = "orange";
      }
    }
    else if(frequency > freqmax){
      pointer.style.left = "97%";
      pointer.style.backgroundColor = "red";
    }
    else if(frequency <= 0){
      pointer.style.left = "0%";
      pointer.style.backgroundColor = "red";
    }
  }
var oscil = "";

function playSound(frequency) {
	oscil = "running";
	document.getElementById("buttonstart").innerText = "Stop";
	oscillator = audioContext.createOscillator();
	oscillator.frequency.value = frequency;
	oscillator.connect(audioContext.destination);
	oscillator.start();
}

function stopSound() {
	document.getElementById("buttonstart").innerText = "Start";
	oscil = "stopped";
	oscillator.stop();
}


function StartButton() {
	if(document.getElementById("Mode").checked == true){
		startPitchDetect();
	}

	else{
		if (document.getElementById("FreqAim").innerText != "Fréquence à obtenir : N/A"){
			if (oscillator && oscil == "running") {
				stopSound();
			} 
			else {
				playSound(Number(document.getElementById("FreqAim").innerText.split(" ")[4]));
			}
		}
	}
}


function hideElements(){
	document.getElementById("hammer").className = "hand inactive";
	if(document.getElementById("Mode").checked == true){
		if (oscillator && oscil == "running") {	
			// si l'oscillateur est en cours de lecture, arrête le son
			stopSound();
		}
		if (VariablesInitialisees()==true){
			changeTextWithBlur("Appuyez sur le bouton Start pour commencer !");
		}
		else{
			changeTextWithBlur("Veuillez entrer les paramètres du rayon.");
		}
		document.getElementById("gauge").style.display = "block";
		document.getElementById("detector").style.height = "0%";
		document.getElementById("reglage").innerText = "--";
		document.getElementById("note").innerText = "--";
	}
	else{
		// si updatePitch est en cours, arrête le traitement
		if (rafID) {
			window.cancelAnimationFrame(rafID);
			rafID = null;
		}
		if (VariablesInitialisees()==true){
			changeTextWithBlur("Appuyez sur le bouton Start afin de commencer le réglage en fonction du son émis !");
		}
		else{
			changeTextWithBlur("Veuillez entrer les paramètres du rayon.");
		}
		freqtohave = Number(document.getElementById("FreqAim").innerText.split(" ")[4]);
		updateGauge(freqtohave);
		document.getElementById("gauge").style.display = "none";
		document.getElementById("detector").style.height = "0%";
		document.getElementById("reglage").innerText = "";
		document.getElementById("note").innerText = " ";
	} 
}
