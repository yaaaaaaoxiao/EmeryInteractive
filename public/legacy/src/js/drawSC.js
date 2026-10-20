//this contains all functions needed to draw the different views.  Ideally this will be defined from an input file.

function drawAtoms(){
	//used for the default view, hard sphere view, and sparse view

	var radius = params.size/2;

	//draw the full spheres (this should be from an input file)
	//corners
	var p1  = new THREE.Vector3(0, 				0, 				0);
	var p2  = new THREE.Vector3(params.size, 	0, 				0);
	var p3  = new THREE.Vector3(0, 				params.size, 	0);
	var p4  = new THREE.Vector3(params.size, 	params.size, 	0);
	var p5  = new THREE.Vector3(0, 				0,				params.size);
	var p6  = new THREE.Vector3(params.size, 	0, 				params.size);
	var p7  = new THREE.Vector3(0, 				params.size, 	params.size);
	var p8  = new THREE.Vector3(params.size,	params.size, 	params.size);

	var allP = [p1,p2,p3,p4,p5,p6,p7,p8]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.defaultOuterOpacity, params.sphereColor, p, params.showAtoms, 'Atoms');
		params.spheres.push(mesh);
	})	

	//Quarter spheres
	var r1 = new THREE.Vector3(0,				Math.PI/2.,		0); 
	var r2 = new THREE.Vector3(0,				0,				0); 
	var r3 = new THREE.Vector3(Math.PI/2.,		Math.PI/2.,		0);  
	var r4 = new THREE.Vector3(Math.PI/2.,		0,				0);
	var r5 = new THREE.Vector3(0,				Math.PI/2.,		-Math.PI/2.); 
	var r6 = new THREE.Vector3(0,				-Math.PI/2.,	0);
	var r7 = new THREE.Vector3(Math.PI/2.,		0,				Math.PI);  
	var r8 = new THREE.Vector3(Math.PI,		    0,				0);
	allP = [p1,p2,p3,p4,p5,p6,p7,p8]
	allR = [r1,r2,r3,r4,r5,r6,r7,r8]
	allP.forEach(function(p, i){
		var mesh = drawQuarterSphere(radius, params.sphereSegments, params.sphereSegments, params.defaultInnerOpacity, params.sphereColor, p, allR[i], params.showAtoms, 'Atoms');
		params.hemiSpheres.push(mesh);
	})

}

function drawOctahedral(){
	//interstitial octahedral sites, touch 6 atoms
	//Note: this is actually cubic, but I will keep the name Octahedrals here so that I don't need to change everything in the code
	var radius = params.size/2*0.732; 

	//draw the full spheres (this should be from an input file)
	var p1  = new THREE.Vector3(params.size/2., params.size/2., params.size/2.);


	var allP = [p1]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.octahedralColor, p, params.showOctahedrals, 'Octahedrals');
		params.spheres.push(mesh);
	})
}
function addLights(){
	//define lights
	params.lights = [];
	//params.lights[0] = new THREE.DirectionalLight(0xffffff, 1.2)
	params.lights[0] = new THREE.PointLight( 0xffffff, 1.2, 0 );
	// lights[ 1 ] = new THREE.PointLight( 0xffffff, 1, 0 );
	// lights[ 2 ] = new THREE.PointLight( 0xffffff, 1, 0 );

	//lights[0].position.set( 0, 200, 0 );
	params.lights[0].position.copy(params.camera.position );
	// lights[ 1 ].position.set( 100, 200, 100 );
	// lights[ 2 ].position.set( - 100, - 200, - 100 );

	params.lights.forEach(function(element){
		params.scene.add(element);
	})

}

function drawCoordination(){
	//this is the coordination view.  

	var radius = params.size*Math.sqrt(2)/4.*params.sparseScale;

	//For SC, we can look at the atom at the origin (0 0 0) coordinated with (1 0 0), (0 1 0), and (0 0 1), as well as their negatives: (-1 0 0), (0 -1 0), (0 0 -1). Six in total.

	//center
	p0 = new THREE.Vector3(0.,	0,	0.);
	var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p0, false, 'coordinationSphere');
	mesh.type = "coordinationAtoms";
	params.coordination.push(mesh);

	//spheres
	var p1 = new THREE.Vector3(params.size,  0,            0);
	var p2 = new THREE.Vector3(0.,           params.size,  0);
	var p3 = new THREE.Vector3(0,            0,            params.size);
	var p4 = new THREE.Vector3(-params.size, 0,            0);
	var p5 = new THREE.Vector3(0.,           -params.size, 0);
	var p6 = new THREE.Vector3(0,            0,            -params.size);

	var allP = [p1,p2,p3,p4,p5,p6]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p, false, 'coordinationSphere');
		mesh.type = "coordinationAtoms";
		params.coordination.push(mesh);
	});

	//cylinders
	//positions
	var n = new THREE.Vector3(2,2,2);
	var p0to1 = p0.clone().add(p1).divide(n);
	var p0to2 = p0.clone().add(p2).divide(n);
	var p0to3 = p0.clone().add(p3).divide(n);
	var p0to4 = p0.clone().add(p4).divide(n);
	var p0to5 = p0.clone().add(p5).divide(n);
	var p0to6 = p0.clone().add(p6).divide(n);

	//lengths
	var h0to1 = p0.clone().sub(p1).length();
	var h0to2 = p0.clone().sub(p2).length();
	var h0to3 = p0.clone().sub(p3).length();
	var h0to4 = p0.clone().sub(p4).length();
	var h0to5 = p0.clone().sub(p5).length();
	var h0to6 = p0.clone().sub(p6).length();

	//rotation (not sure what the algorithm is here...)
	var r0to1 = new THREE.Vector3(0.,          0., Math.PI/2.);
	var r0to2 = new THREE.Vector3(0.,          0., 0.);
	var r0to3 = new THREE.Vector3(Math.PI/2., 0., 0.);
	var r0to4 = new THREE.Vector3(0.,          0., Math.PI/2.);
	var r0to5 = new THREE.Vector3(0.,          0., 0.);
	var r0to6 = new THREE.Vector3(Math.PI/2., 0., 0.);

	var allP = [p0to1,p0to2,p0to3,p0to4,p0to5,p0to6]
	var allR = [r0to1,r0to2,r0to3,r0to4,r0to5,r0to6]
	var allH = [h0to1,h0to2,h0to3,h0to4,h0to5,h0to6]
	allP.forEach(function(p,i){
		var mesh = drawCylinder(radius/4., allH[i], params.cylinderRadialSegments, params.cylinderHeightSegments, params.cylinderColor, allP[i], allR[i]);
		mesh.type = "coordinationAtoms";
		params.coordination.push(mesh);
	});


	// Cubic site (0.5-0.5-0.5) is coordinate with 8 atoms atoms at:
	// 0-0-0, 1-0-0, 0-1-0, 0-0-1, 1-1-0, 1-0-1, 0-1-1, 1-1-1.

	//center
	p0 = new THREE.Vector3(params.size/2.,	params.size/2.,	params.size/2.);
	var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.octahedralColor, p0, false, 'coordinationSphere');
	mesh.type = "coordinationCubic";
	params.coordination.push(mesh);

	//spheres
	var p1 = new THREE.Vector3(0, 			0, 				0);
	var p2 = new THREE.Vector3(params.size,	0,				0);
	var p3 = new THREE.Vector3(0,			params.size,	0);
	var p4 = new THREE.Vector3(0,			0,				params.size);
	var p5 = new THREE.Vector3(params.size,	params.size,	0);
	var p6 = new THREE.Vector3(params.size,	0,				params.size);
	var p7 = new THREE.Vector3(0,			params.size,	params.size);
	var p8 = new THREE.Vector3(params.size,	params.size,	params.size);


	var allP = [p1,p2,p3,p4,p5,p6,p7,p8]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p, false, 'coordinationSphere');
		mesh.type = "coordinationCubic";
		params.coordination.push(mesh);
	});


	//cylinders
	//positions
	var n = new THREE.Vector3(2,2,2);
	var p0to1 = p0.clone().add(p1).divide(n);
	var p0to2 = p0.clone().add(p2).divide(n);
	var p0to3 = p0.clone().add(p3).divide(n);
	var p0to4 = p0.clone().add(p4).divide(n);
	var p0to5 = p0.clone().add(p5).divide(n);
	var p0to6 = p0.clone().add(p6).divide(n);
	var p0to7 = p0.clone().add(p7).divide(n);
	var p0to8 = p0.clone().add(p8).divide(n);


	//lengths
	var h0to1 = p0.clone().sub(p1).length();
	var h0to2 = p0.clone().sub(p2).length();
	var h0to3 = p0.clone().sub(p3).length();
	var h0to4 = p0.clone().sub(p4).length();
	var h0to5 = p0.clone().sub(p5).length();
	var h0to6 = p0.clone().sub(p6).length();
	var h0to7 = p0.clone().sub(p7).length();
	var h0to8 = p0.clone().sub(p8).length();

	//rotation (not sure what the algorithm is here...)
	var r0to1 = new THREE.Vector3(0, -Math.PI/4, -Math.acos(p0.z/h0to1));
	var r0to2 = new THREE.Vector3(0,  Math.PI/4,  Math.acos(p0.z/h0to1));
	var r0to3 = new THREE.Vector3(0, -Math.PI/4,  Math.acos(p0.z/h0to1));
	var r0to4 = new THREE.Vector3(0,  Math.PI/4, -Math.acos(p0.z/h0to1));
	var r0to5 = new THREE.Vector3(0,  Math.PI/4, -Math.acos(p0.z/h0to1));
	var r0to6 = new THREE.Vector3(0, -Math.PI/4,  Math.acos(p0.z/h0to1));
	var r0to7 = new THREE.Vector3(0,  Math.PI/4,  Math.acos(p0.z/h0to1));
	var r0to8 = new THREE.Vector3(0, -Math.PI/4, -Math.acos(p0.z/h0to1));

	var allP = [p0to1,p0to2,p0to3,p0to4,p0to5,p0to6,p0to7,p0to8]
	var allR = [r0to1,r0to2,r0to3,r0to4,r0to5,r0to6,r0to7,r0to8]
	var allH = [h0to1,h0to2,h0to3,h0to4,h0to5,h0to6,h0to7,h0to8]
	allP.forEach(function(p,i){
		var mesh = drawCylinder(radius/4., allH[i], params.cylinderRadialSegments, params.cylinderHeightSegments, params.cylinderColor, allP[i], allR[i]);
		mesh.type = "coordinationCubic";
		params.coordination.push(mesh);
	});
}


