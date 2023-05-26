window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var mediaStreamSource = null;
var detectorElem,noteElem;
var Liste_Freq = [];
var oscillator;

// Fonction qui se lance lors du chargement de la page
window.onload = function() {
	InitialisationVariables();
	changement_mode();

	audioContext = new AudioContext();
	MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));	// corresponds to a 5kHz signal

	detectorElem = document.getElementById( "detector" );
	noteElem = document.getElementById( "note" );

}

function startPitchDetect() {
	
			audioContext = new AudioContext();
			changeTextWithBlur("Veuillez activer votre microphone.");

			// demander l'autorisation d'utiliser le microphone
			navigator.mediaDevices.getUserMedia({"audio": "true"}).then((stream) => {
				mediaStreamSource = audioContext.createMediaStreamSource(stream);
				analyser = audioContext.createAnalyser();
				analyser.fftSize = 2048;
				mediaStreamSource.connect( analyser );
				changeTextWithBlur("Veuillez taper au centre du rayon à l'aide d'un objet métallique.");

				isPlaying = true;
				updatePitch();
				
				// Changer la classe de hammer afin de démarrer l'animation
				document.getElementById("hammer").className = "hand active";

			}).catch((err) => {
				//Indiquer à l'utilisateur qu'il doit activer son microphone pour utiliser cette fonctionnalité
				console.error(`${err.name}: ${err.message}`);
				changeTextWithBlur("Appuyez sur le bouton Start pour commencer !");
				alert("Vous devez activer votre microphone pour utiliser cette fonctionnalité.");
			});

}

// Fonction qui permet de changer le texte de l'élément "helpingtext" avec un effet de flou
function changeTextWithBlur(newText) {
	var helpingText = document.getElementById("helpingtext");
	helpingText.classList.add("text-blur"); // Appliquer un effet de flou

	setTimeout(function() {
	  helpingText.innerText = newText; // Changer le texte

	  setTimeout(function() {
		helpingText.classList.remove("text-blur"); // Enlever l'effet de flou
	  }, 50); // Delai pour retirer l'effet de flou (50ms = 0.05s)
	}, 100); // Delai pour changer le texte (100ms = 0.1s)
  }


// Fonction qui permet d'arrêter l'écoute du microphone
function stopListening() {

	sourceNode = audioContext.createBufferSource();
    sourceNode.loop = true;
    analyser = audioContext.createAnalyser();
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start(0);

    if (isPlaying) {

        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );

		// Changer la classe de hammer afin d'arrêter l'animation
		document.getElementById("hammer").className = "hand inactive";
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
	if (rms<0.01) // si le volume du son est trop faible, on ne le prend pas en compte
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
function updatePitch( time ) {
	analyser.getFloatTimeDomainData( buf );
	var ac = autoCorrelate( buf, audioContext.sampleRate );

	// Si le volume du son est trop faible, on ne prend pas en compte cette valeur
	// On change la classe de noteElem à "vague" et on affiche "--"
 	if (ac == -1) {
 		detectorElem.className = "vague";
		noteElem.innerText = "--";
		document.getElementById("reglage").innerText = "--";
	} 

	// Sinon, on affiche la fréquence détectée
	else {
	 	detectorElem.className = "confident";
	 	pitch = ac;

		// Si la fréquence détectée est comprise entre 40 et 1000 Hz
		// On l'ajoute à la liste Liste_Freq qui contient les fréquences détectées associées à leur temps d'apparition
		if(Math.round( pitch ) > 40 && Math.round( pitch ) < 1000){
			Liste_Freq.push([((Liste_Freq.length)/60).toFixed(2), Math.round( pitch )]);
		}

		// Une fois que l'on a détecté 50 fréquences, on arrête l'écoute du microphone
		if (Liste_Freq.length > 60) { // 60 valeurs équivaut à environ 1seconde
		
			// On arrête l'écoute du microphone
			stopListening();

			// On calcule la moyenne des fréquences détectées
			moyenne_freq = smart_average();

			// On calcule les reglages à effectuer
			Reglage(moyenne_freq);
			updateGauge(moyenne_freq);

			// On affiche la fréquence détectée
			detectorElem.className = "confident";
			noteElem.innerText = Math.round(moyenne_freq) + " Hz";

			// On affiche les réglages à effectuer en fonction de la situation
			if(document.getElementById("reglage").innerText == "Parfait!"){
				changeTextWithBlur("Fréquence du rayon : " + noteElem.innerText + ". Félicitations, vous avez réussi à accorder votre rayon !");
			}

			// Si les différents paramètres du rayon n'ont pas été initialisés, on demande à l'utilisateur de le faire
			else if (!is_parameter_init()){
				changeTextWithBlur("Veuillez entrer les paramètres de votre rayon dans la section correspondante.");
			}
			else{
				changeTextWithBlur("Fréquence du rayon : " + noteElem.innerText + ". Veuillez suivre les instructions ci-dessous et recommencer.");
			}
			Liste_Freq = [];
			
		}
		
	}
	
	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}

// Fonction qui permet de calculer la moyenne des fréquences détectées (en enlevant les valeurs aberrantes)
function smart_average(){

	// On ajoute les fréquences détectées à la liste liste_des_frequences
	liste_des_frequences = []
	for(var i = 0; i < Liste_Freq.length; i++){
		liste_des_frequences.push(Liste_Freq[i][1]);
	}

	var freq = [] ;
	var liste_de_liste_freq = [];

	// On trie la liste des fréquences
	liste_des_frequences.sort();

	// On récupère la taille de la liste des fréquences
	len=liste_des_frequences.length;

	// Pour chaque fréquence, on créé une liste avec avec celle-ci et les fréquences qui lui sont proches (à 10Hz près)
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

	// On récupère la liste de fréquences la plus longue
	for (var i=0; i<len; i++) {
		if (liste_de_liste_freq[i].length > liste_de_liste_freq[position].length) 
			position = i;
	}

	var sum = 0;
	len = liste_de_liste_freq[position].length;

	// On calcule la moyenne des fréquences de la liste la plus longue
	for (var i=0; i<len; i++) {
		sum += liste_de_liste_freq[position][i];
	}

	var avg = sum / (liste_de_liste_freq[position]).length;

	// On retourne la moyenne des fréquences
	return avg;
}

// Fonction qui vérifie que les différents paramètres du rayon ont été correctement initialisés par l'utilisateur
function is_parameter_init(){

	// expression pour vérifier que les valeurs entrées sont des nombres positifs entiers ou décimaux (ex : 0.5)
	var regex = /^[0-9]+(\.[0-9]+)?$/;

	// On récupère les valeurs entrées par l'utilisateur
	var density = document.getElementById("density").value;
	var LengthEntry = document.getElementById("LengthEntry").value;
	var TenseEntry = document.getElementById("TenseEntry").value;
	var diameter = document.getElementById("diameter").value;
	
	// On vérifie que les valeurs entrées sont des nombres positifs entiers ou décimaux (ex : 0.5)
	if (regex.test(density) && regex.test(LengthEntry) && regex.test(TenseEntry) && regex.test(diameter)){
		return true;
	}
	else{
		return false;
	}
	
}

// Fonction qui permet de calculer la fréquence à obtenir en fonction des paramètres du rayon et 
// Elle change également la classe des paramètres en fonction de leur état
function InitialisationVariables(){	

	// On vérifie que les différents paramètres du rayon ont été correctement initialisés par l'utilisateur
	if (is_parameter_init() == true){
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

		// On récupère les valeurs entrées par l'utilisateur et on les convertit dans les unités du SI
		var Tension = document.getElementById("TenseEntry").value; // N
		var Longueur = document.getElementById("LengthEntry").value * 0.01; // cm to m
		var Masse_Volumique = document.getElementById("density").value * 1000; // density to kg/m3
		var Diametre = document.getElementById("diameter").value * 0.001; // mm to m
		var Masse = Masse_Volumique * Math.PI * Math.pow(Diametre,2) * Longueur / 4; // kg
		var Masse_Lineique = Masse / Longueur ; // kg/m
		
		// On calcule la fréquence à obtenir grace à l'équation de la corde vibrante
		// On ajoute un correctif de 39 Hz
		var Freq = Math.round((1/(2*Longueur))*Math.sqrt(Tension/Masse_Lineique)) + 39;

		document.getElementById("FreqAim").innerText = "Fréquence à obtenir : "+(Number(Freq))+" Hz";
	}

	// Si les paramètres n'ont pas été correctement initialisés, on les vérifie un par un
	else {
		var regex = /^[0-9]+(\.[0-9]+)?$/;

		document.getElementById("FreqAim").innerText = "Fréquence à obtenir : inconnue";
		changeTextWithBlur("Veuillez entrer les paramètres du rayon.");

		if (!regex.test(document.getElementById("TenseEntry").value)){
			document.getElementById("Tension").className = "vague";
		}
		else{document.getElementById("Tension").className = "confident";}

		if (!regex.test(document.getElementById("LengthEntry").value)){
			document.getElementById("Longueur").className = "vague";
		}
		else{document.getElementById("Longueur").className = "confident";}

		if (!regex.test(document.getElementById("density").value)){
			document.getElementById("Densité").className = "vague";
		}
		else{document.getElementById("Densité").className = "confident";}

		if (!regex.test(document.getElementById("diameter").value)){
			document.getElementById("Diametre").className = "vague";
		}
		else{document.getElementById("Diametre").className = "confident";}
	}
	
}

// Fonction qui permet de trouver le réglage à effectuer en fonction de la fréquence émise par le rayon
function Reglage(pitch){

	if (document.getElementById("FreqAim").innerText != "Fréquence à obtenir : inconnue"){
		
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

// Fonction qui met à jour la jauge en fonction de la fréquence émise par le rayon
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

// Fonction qui permet de jouer un son à une fréquence donnée
function playSound(frequency) {
	oscil = "running";
	document.getElementById("buttonstart").innerText = "Stop";
	oscillator = audioContext.createOscillator();
	oscillator.frequency.value = frequency;
	oscillator.connect(audioContext.destination);
	oscillator.start();
}

// Fonction qui permet d'arrêter le son
function stopSound() {
	document.getElementById("buttonstart").innerText = "Start";
	oscil = "stopped";
	oscillator.stop();
}

//Fonction qui se lance lorsque l'utilisateur clique sur le bouton "Start" ou "Stop" quelque soit le mode choisi
function StartButton() {
	if(document.getElementById("Mode").checked == true){
		startPitchDetect();
	}
	else{
			if (oscillator && oscil == "running" ) {
				stopSound();
			}  

			else {
				if (document.getElementById("FreqAim").innerText != "Fréquence à obtenir : inconnue"){
				playSound(Number(document.getElementById("FreqAim").innerText.split(" ")[4]));
				}
			} 
		
	}
}

// Fonction qui permet se lance lorsque l'utilisateur change de mode (écoute/auto)
function changement_mode(){
	// Arrete l'animation du marteau
	document.getElementById("hammer").className = "hand inactive";

	// Si on est dans le mode "auto"
	if(document.getElementById("Mode").checked == true){

		// si un son est en train d'être joué, arrête le son
		if (oscillator && oscil == "running") {	
			stopSound();
		}

		// si tout les paramètres sont initialisés, affiche le texte correspondant
		if (is_parameter_init()==true){
			changeTextWithBlur("Appuyez sur le bouton Start pour commencer !");
		}

		else{
			changeTextWithBlur("Veuillez entrer les paramètres du rayon.");
		}

		// affiche la jauge et l'emplacement du détecteur
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

		// si tout les paramètres sont initialisés, affiche le texte correspondant
		if (is_parameter_init()==true){
			changeTextWithBlur("Appuyez sur le bouton Start afin de commencer le réglage en fonction du son émis !");
		}
		else{
			changeTextWithBlur("Veuillez entrer les paramètres du rayon.");
		}

		// cache la jauge et l'emplacement du détecteur
		// réinitialise la jauge à la fréquence à obtenir
		freqtohave = Number(document.getElementById("FreqAim").innerText.split(" ")[4]);
		updateGauge(freqtohave);
		document.getElementById("gauge").style.display = "none";
		document.getElementById("detector").style.height = "0%";
		document.getElementById("reglage").innerText = "";
		document.getElementById("note").innerText = " ";
	} 
}
