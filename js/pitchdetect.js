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

window.onload = function() {
	Test();
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
	
	fetch('whistling3.ogg')
		.then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP error, status = ${response.status}`);
			}
			return response.arrayBuffer();
		}).then((buffer) => audioContext.decodeAudioData(buffer)).then((decodedData) => {
			theBuffer = decodedData;
		});

}

function startPitchDetect() {
			// grab an audio context
			audioContext = new AudioContext();

			// Attempt to get audio input
			navigator.mediaDevices.getUserMedia(
			{
				"audio": {
					"mandatory": {
						"googEchoCancellation": "false",
						"googAutoGainControl": "false",
						"googNoiseSuppression": "false",
						"googHighpassFilter": "false"
					},
					"optional": []
				},
			}).then((stream) => {
				// Create an AudioNode from the stream.
				mediaStreamSource = audioContext.createMediaStreamSource(stream);

				// Connect it to the destination.
				analyser = audioContext.createAnalyser();
				analyser.fftSize = 2048;
				mediaStreamSource.connect( analyser );
				updatePitch();

			}).catch((err) => {
				// always check for errors at the end.
				console.error(`${err.name}: ${err.message}`);
				alert('Stream generation failed.');
			});

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
	if (rms<0.015) // not enough signal 
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
	// TODO: Paint confidence meter on canvasElem here.

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

		if (FreqGraph.length > 15) { //15 = 0.25s
			//console.log(averagesimplified());
			Reglage(averagesimplified());
			updateGauge(averagesimplified());
			noteElem.innerText = Math.round(averagesimplified()) + " Hz";
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

//If there is text in the input of id="TenseEntry" then div.id="Tension"="confident"
//Else div.id="Tension"="vague"
function Test(){	

	if (document.getElementById("LinearMassEntry").value != "" && document.getElementById("LengthEntry").value != "" && document.getElementById("TenseEntry").value != ""){
		var Tense = document.getElementById("TenseEntry").value;
		var Length = document.getElementById("LengthEntry").value;
		var LinearMass = document.getElementById("LinearMassEntry").value;
		var Freq = Math.round((1/(2*Length))*Math.sqrt(Tense/LinearMass));
		document.getElementById("FreqAim").innerText = "Fréquence à obtenir : "+Freq+" Hz";
	}
	else {document.getElementById("FreqAim").innerText = "Fréquence à obtenir : N/A";}

	if (document.getElementById("TenseEntry").value == ""){
		document.getElementById("Tension").className = "vague";
	}
	else{document.getElementById("Tension").className = "confident";}

	if (document.getElementById("LengthEntry").value == ""){
		document.getElementById("Longueur").className = "vague";
	}
	else{document.getElementById("Longueur").className = "confident";}

	if (document.getElementById("LinearMassEntry").value == ""){
		document.getElementById("Masselineique").className = "vague";
	}
	else{document.getElementById("Masselineique").className = "confident";}
	
}

function Reglage(pitch){

	console.log("testorigine");
	
	if (document.getElementById("FreqAim").innerText != "Fréquence à obtenir : N/A"){
		console.log("test");
		
		freq_theorique = Number(document.getElementById("FreqAim").innerText.split(" ")[4]);
		console.log(freq_theorique);
		
		if (Number(pitch) < freq_theorique-10){
			document.getElementById("reglage").innerText = "Augmenter la tension";
			console.log("augmenter");
		}

		else if (Number(pitch) > freq_theorique+10){
			document.getElementById("reglage").innerText = "Réduire la tension";
			console.log("reduire");
		}
		
		else if (Number(pitch) >= freq_theorique-10 && Number(pitch) <= freq_theorique+10){
			document.getElementById("reglage").innerText = "Parfait!";
			console.log("parfait");
		}
		
		else{
			console.log("test");
			document.getElementById("reglage").innerText = "Réglage inconnu";
		}
		
	}
	
}

function updateGauge(frequency){
	var freqtohave = Number(document.getElementById("FreqAim").innerText.split(" ")[4]);
    var freqmax = 2*freqtohave;
    var pointer = document.getElementById("pointer");
    if(frequency < freqmax && frequency > 0){
      if(frequency < (freqtohave + (0.02*freqtohave)) && frequency > (freqtohave-(freqtohave*0.02))){
        pointer.style.left = "47%";
        pointer.style.backgroundColor = "green";
      }
      else{
      pointer.style.left = ((frequency/freqmax)*100)-3 + "%";
      pointer.style.backgroundColor = "orange";
      }
    }
    if(frequency > freqmax){
      pointer.style.left = "97%";
      pointer.style.backgroundColor = "red";
    }
    if(frequency <= 0){
      pointer.style.left = "0%";
      pointer.style.backgroundColor = "red";
    }
  }

function hideGauge(){
	if(document.getElementById("GaugeCheck").checked == true){
		document.getElementById("gauge").style.display = "block";
		document.getElementById("detector").style.height = "0%";
	}
	else{
		document.getElementById("gauge").style.display = "none";
		document.getElementById("detector").style.height = "5%";
	}
}