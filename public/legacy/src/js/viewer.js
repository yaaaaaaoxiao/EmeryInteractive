//this file contains all the functions used by the three.js renderer to draw and animate the scene

function updateTextRotation(){
	//keep text always facing the screen

	params.text.forEach(function(m){
		m.quaternion.copy(params.camera.quaternion);
	});
}

function updateLights(){
	//keep the light coming from the camera location

	params.lights.forEach(function(l){
		l.position.copy(params.camera.position );
	});
}

function checkClickedPlane(){
	//show/hide the plane from the double clicks if the slice plane is also shown
	var x = params.scene.getObjectByName('ttPlane')
	if (typeof x != "undefined"){
		x.visible = !params.isSlice;
	}
}

function updateSlice(p,r){
	//for the slice, in case we want to change it dynamically

	params.sliceMesh.forEach(function(m){
		params.scene.remove(m);
	})
	params.sliceMesh = [];

	//in case there's already a plane drawn from double clicking
	checkClickedPlane();

	//seeing a small blending issue at x=0 (not sure the best way to fix this!)
	var check = Math.max(Math.abs(p.x),1e-2);
	sign = 1.
	if (p.x != 0) sign = Math.sign(p.x);
	p.x = sign*check;

	var slice = drawSlice(4.*params.size, p, r, params.sliceOpacity, params.sliceColor);
	params.sliceMesh.push(slice.plane);
	params.sliceMesh.push(slice.planeLine);
	slice.mesh.forEach(function(m){
		params.sliceMesh.push(m);
	})
}

function updateSlicePlaneDepth(){
	//fix to allow viewer to see through the slice plane when objects are behind it (changing the depthText option)
	
	var normal = params.slicePlane.geometry.faces[0].normal;
	var pos = params.camera.position.clone().sub(params.slicePlanePosition.clone().sub(params.offsetPosition));
	var pCheck = normal.dot(pos)*Math.abs(Math.cos(params.yRfac)*Math.sin(params.xRfac)); //no idea if this is formally correct, but it seems to work...
	if (pCheck < 1){
		params.slicePlane.material.depthTest = true;
	} else {
		params.slicePlane.material.depthTest = false;
	}

}



function drawScene(mol){
	//draw the scene (with lighting)

	//draw the main spheres (for default, hard-Sphere and Sparse views)
	drawAtoms();

	//draw the interstitial sites
	if (mol != 'HCP') drawOctahedral();
	if (mol != 'SC' && mol != 'HCP') drawTetrahedral();
	if (mol == 'FCC') drawTriangular();

	//draw the slice view (updateSlice calls drawSlice -- written this way to facilitate dynamic updating of slice mesh)
	updateSlice(params.slicePlanePosition, params.slicePlaneRotation);

	//draw the coordinate view
	drawCoordination();

	//draw the box 
	drawBox();

	//draw the axes (with labels)
	drawAxes();

	//draw the labels
	drawLabels();

	//lights
	addLights();

	//some things that we only need to do when the camera moves
	params.controls.addEventListener( 'change', updateLights );
	params.controls.addEventListener( 'change', updateSlicePlaneDepth );
	params.controls.addEventListener( 'change', updateTextRotation );

}

function animate(time) {
	//this is the main animation loop

	requestAnimationFrame( animate );

	//a few items to update
	params.controls.update();
	params.keyboard.update();
	TWEEN.update(time);

	//move the tooltips if necessary
	params.ttMeshIndex.forEach(function(loc){
		moveTooltip(loc);
	})


	//if you want to know the camera position, uncomment this. typing c will show it in the console
	// if (params.keyboard.down("C")){
	// 	console.log(params.camera.position)
	// }

	//testing dynamically updating the slice location
	if (params.isSlice){


		if (params.keyboard.pressed("up")){
			params.xPfac += params.size*0.02;
			params.doSliceUpdate = true;
		}
		if (params.keyboard.pressed("down")){
			params.xPfac -= params.size*0.02;
			params.doSliceUpdate = true;
		}
		if (params.keyboard.pressed("shift")){
			if (params.keyboard.pressed("left")){
				params.xRfac += Math.PI*0.02;
				params.doSliceUpdate = true;
			}
			if (params.keyboard.pressed("right")){
				params.xRfac -= Math.PI*0.02;
				params.doSliceUpdate = true;
			}
		}else{
			if (params.keyboard.pressed("left")){
				params.yRfac += Math.PI*0.02;
				params.doSliceUpdate = true;
			}
			if (params.keyboard.pressed("right")){
				params.yRfac -= Math.PI*0.02;
				params.doSliceUpdate = true;
			}
		}

		if (params.doSliceUpdate){
			params.xPfac = THREE.Math.clamp(params.xPfac, -0.5*params.size, 1.5*params.size);
			var p = params.slicePlanePosition.clone();
			p.x = params.xPfac;

			//params.xRfac = THREE.Math.clamp(params.xRfac, -Math.PI/2., Math.PI/2.);
			//params.yRfac = THREE.Math.clamp(params.yRfac, -Math.PI/2., Math.PI/2.);
			params.slicePlaneRotation = new THREE.Euler( params.xRfac, params.yRfac, 0, 'XYZ' );
			updateSlice(p, params.slicePlaneRotation);
			showSliceMesh(true);
			params.doSliceUpdate = false;
		}
	}

	//draw everything in the render window
	params.renderer.render( params.scene, params.camera );

}
function resizeText(id){
	//main text
	var sMin = 16;
	var sH = d3.select(id).node().scrollHeight;
	var oH = d3.select(id).node().offsetHeight;
	var tT = null;
	if (d3.select(id).selectAll('.title').node()){
		tT = parseFloat(d3.select(id).selectAll('.title').style('font-size'));
	}
	var sT = parseFloat(d3.select(id).selectAll('.subTitle').style('font-size'));
	var pT = parseFloat(d3.select(id).selectAll('.para').style('font-size'));
	//console.log('resizing ...', id, sH, oH, oH-sH, sT);
	var n = 0.;
	var nmax = 100.;
	var nfac = 5.;
	var sfac = 1.;
	var done = false;
	if (sH > oH) sfac = -1.//shrink
	if (sfac == 1 && ((oH-sH) <= 2 && sT >= 24)) done = true;
	if (sfac == -1 && sT <= sMin) done = true;
	while (!done && n < nmax){
		n+=1;
		sT += sfac*n/nfac;
		tT += sfac*n/nfac;
		pT += sfac*n/nfac
		if (tT) d3.select(id).selectAll('.title').style('font-size', tT +'px');
		d3.select(id).selectAll('.subTitle').style('font-size', sT +'px');
		d3.select(id).selectAll('.para').style('font-size', pT +'px');
		sH = d3.select(id).node().scrollHeight;
		oH = d3.select(id).node().offsetHeight;
		if (sfac == 1 && sH > oH) {
			sfac = -1.;//shrink
			nfac += 0.1;
		}
		if ((sfac == -1 && (oH-sH) <= 2) || sT < 24){
			sfac == 1.;
			nfac += 0.1;
		}
		if (sfac == -1 && sH <= oH) done = true;
		if (sfac == 1 && ((oH-sH) <= 2 && sT >= 24)) done = true;
		if (sfac == -1 && sT <= sMin) done = true;
		//console.log("text", id, n, sfac, nfac, sH, oH, sT + sfac*n/nfac, pT + sfac*n/nfac)
	}


}
function resizeContainers(){
	//resize all the divs and buttons (used when browser window is resized)

	console.log('resizing')
	var m = 10; //margin
	var b = 50; //button height
	var controlsWidth = 230; //width of the controls container

	var vHeight = parseFloat(window.innerHeight) - 4.*m - 2.*b;
	var vWidth = vHeight/params.aspect;
	if (vWidth > params.canvasFrac*parseFloat(window.innerWidth)){
		vWidth = params.canvasFrac*parseFloat(window.innerWidth);
		vHeight = vWidth*params.aspect;
	}
	if (vWidth < params.canvasMinWidth){
		vWidth = params.canvasMinWidth;
		vHeight = vWidth*params.aspect;
	}

	var iWidth = Math.max(params.textMinWidth, parseFloat(window.innerWidth) - vWidth - 4.*m);
	var iPadding = 20;


	//canvas
	d3.select('#WebGLContainer')
		.style('position','absolute')
		.style('top',m + 'px')
		.style('left',controlsWidth + 2.*m +'px')
		.style('padding',0)
		.style('margin',0)
		.style('width',vWidth + 'px')
		.style('height',vHeight + 'px')
		.style('z-index',1)
	if (params.renderer != null){
		d3.select("#WebGLContainer").select('canvas')
			.style('width', vWidth)
			.style('height', vHeight)
	}


	//text 
	d3.select('#textContainer')
		.style('position','absolute')
		.style('top',m + 'px')
		.style('left',(controlsWidth + vWidth + 3.*m) +'px')
		.style('margin',0)
		.style('padding',iPadding + 'px')
		.style('width',iWidth - 2.*iPadding - controlsWidth + 'px')
		.style('height',vHeight - 2.*iPadding + 2.*b + 2.*m + 'px')
		.style('z-index',1)

	//try to fit the text so that there is no scroll bar in the textContainer
	resizeText('#textContainer');

	//buttons
	setupButtons(vHeight, vWidth, controlsWidth, m, b);

	//controls
	resizeControls(vHeight, controlsWidth, m, b);

	//renderer
	if (params.renderer != null){
		var width = parseFloat(params.container.style('width'));
		var height = parseFloat(params.container.style('width'));
		var aspect = width / height;
		params.camera.aspect = aspect;
		params.camera.updateProjectionMatrix();

		params.renderer.setPixelRatio(window.devicePixelRatio); //in case the window moved to a screen with a different DPI
		params.renderer.setSize( width, height);
	}

	//create the help boxes
	// var helpDivIDs = ['WebGLContainer','textContainer','buttonContainer']
	// var helpDivNames = ['WebGLHelp','textHelp','buttonHelp']
	//d3.select('#helpContainer').selectAll('div').remove();
	d3.select('#loading').remove();
	d3.select('#helpContainer').selectAll('div').classed('hidden', false);
	if (!d3.select('#helpContainer').classed('hidden')){
		d3.selectAll('#textContainer').classed('scrollable', false);
		d3.selectAll('#textContainer').classed('notScrollable', true);
	}
	d3.select('#helpContainer')
		.style('background-color','rgba(100, 100, 100,'+params.helpOpacity+')')
		// //clone the divs from the main page, for formatting
		// .selectAll("div")
		// 	.data(helpDivIDs).enter()
		// 		.append(function(d,i){
		// 			var clone = d3.select('#'+d).node().cloneNode(true);
		// 			clone.id = helpDivNames[i];
		// 			clone.innerHTML = "";
		// 			d3.select(clone).classed('bordered', true)
		// 			return clone;
		// 		})
		//fade out on click
		.on('click', function(){
			//d3.selectAll('.buttonDiv').classed('buttonClicked', false);
			d3.selectAll('.buttonDiv').classed('buttonHover', true);
			d3.selectAll('#helpButton').classed('buttonClicked', false);
			d3.select('#helpContainer').transition(params.transition)
				.style('background-color','rgba(100, 100, 100, 0)')
				.style('opacity',0)
				.on("end", function(){
					d3.select('#helpContainer').classed('hidden', true);
					d3.selectAll('#textContainer').classed('scrollable', true);
					d3.selectAll('#textContainer').classed('notScrollable', false);

				});
		})


	//copy over the styles
	var el = document.getElementById('textContainer')
	var css = window.getComputedStyle(el);
	for (var i=0, l = el.style.length; i<l; i++) {
		d3.select('#helpText').style(el.style[i],css.getPropertyValue(""+el.style[i]));
	}
	d3.select('#helpText')
		.style('background-color','rgba(100, 100, 100, 1)')
	resizeText('#helpText');
}


///////////////////////////
function WebGLStart(mol, color){
	//this is called to start everything

	//initialize everything
	init(mol, color);

	//draw everything
	drawScene(mol);

	//begin the animation
	animate();
}

///////////////////////////
// runs on load
///////////////////////////
window.addEventListener("resize", resizeContainers)


