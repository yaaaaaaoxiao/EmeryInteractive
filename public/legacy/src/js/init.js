//this file contains all the functions used to initialize the scene

function defineTweens(){
	//define the two tweens for the different views

	params.defaultViewTween = new TWEEN.Tween(params.camera.position)
		.to(params.defaultView, params.tweenDuration)
		.easing(TWEEN.Easing.Linear.None);


	params.coordinationViewTween = new TWEEN.Tween(params.camera.position)
		.to(params.coordinationView, params.tweenDuration)
		.easing(TWEEN.Easing.Linear.None);
}

function init(mol, color){
	//this initializes everything needed for the scene

	//define the params object (see params.js)
	defineParams(mol, color);

	//size the viewer, buttons and text divs
	resizeContainers();

	//get the sizes for the renderer
	params.container = d3.select('#WebGLContainer')
	var width = parseFloat(params.container.style('width'));
	var height = parseFloat(params.container.style('width'));
	var aspect = width / height;

	//define the three.js renderer
	params.renderer = new THREE.WebGLRenderer( {
		antialias:true,
	} );
	params.renderer.setPixelRatio(window.devicePixelRatio); //render at full resolution on high-DPI (e.g., Retina) screens
	params.renderer.setSize(width, height);

	params.container.node().appendChild( params.renderer.domElement );

	//define the three.js scene
	params.scene = new THREE.Scene();     
	params.scene.background = new THREE.Color( 0xffffff );

	//define the three.js camera
	params.camera = new THREE.PerspectiveCamera( params.fov, aspect, params.zmin, params.zmax);
	params.camera.up.set(0, 0, 1);
	params.camera.position.set(params.defaultView.x, params.defaultView.y, params.defaultView.z);
	params.scene.add(params.camera);  

	//define the three.js controls
	//params.controls = new THREE.TrackballControls( params.camera, params.renderer.domElement );
	params.controls = new THREE.OrbitControls( params.camera, params.renderer.domElement);
	params.controls.enablePan = false;
	params.controls.rotateSpeed = 0.5;
	params.domElement = params.renderer.domElement;
	//params.controls.addEventListener( 'change', function(){console.log(params.camera.position) });

	//define the keyboard detector
    params.keyboard = new KeyboardState();

	//define the tweens
	defineTweens();

}

//for timestamps in google analytics
//is there a way I can add this to analytics events?
//https://gtm.tips/add-timestamp-ga-events/
function timeStamp() {
	try {
		var times = new Date();
		var time = times.toString().split(' ');
		return time[3]+ " " +time[1]+ " " +time[2]+ " "+time[4];
	} catch(e) {
		return "unknown";
	}
}


//for IP addresses for google analytics
//https://ourcodeworld.com/articles/read/257/how-to-get-the-client-ip-address-with-javascript-only
function getIP(json) {
	params.userIP = json.ip;
	console.log("IP address : ", params.userIP)
}

//Google Analytics https://developers.google.com/analytics/devguides/collection/analyticsjs/
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-138410157-1', 'auto');
ga('send', 'pageview');
