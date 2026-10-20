//this contains all functions needed to draw the different views.  Ideally this will be defined from an input file.

function drawAtoms(){
	//used for the default view, hard sphere view, and sparse view

	var radius = params.size*Math.sqrt(2)/4.

	//draw the full spheres (this should be from an input file)
	//corners
	var p1  = new THREE.Vector3(0, 				0, 				0);
	var p2  = new THREE.Vector3(params.size, 	0, 				0);
	var p3  = new THREE.Vector3(0, 				params.size, 	0);
	var p4  = new THREE.Vector3(params.size, 	params.size, 	0);
	var p5  = new THREE.Vector3(0, 				0,				params.size);
	var p6  = new THREE.Vector3(params.size, 	0, 				params.size);
	var p7  = new THREE.Vector3(0, 				params.size, 	params.size);
	var p8  = new THREE.Vector3(params.size,		params.size, 	params.size);
	//centers on planes
	var p9  = new THREE.Vector3(0,				params.size/2.,	params.size/2.);
	var p10 = new THREE.Vector3(params.size/2.,	0,				params.size/2.);
	var p11 = new THREE.Vector3(params.size/2.,	params.size/2.,	0);
	var p12 = new THREE.Vector3(params.size,	params.size/2.,	params.size/2.);
	var p13 = new THREE.Vector3(params.size/2.,	params.size,	params.size/2.);
	var p14 = new THREE.Vector3(params.size/2.,	params.size/2.,	params.size);

	var allP = [p1,p2,p3,p4,p5,p6,p7,p8, p9,p10,p11,p12,p13,p14]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.defaultOuterOpacity, params.sphereColor, p, params.showAtoms, 'Atoms');
		params.spheres.push(mesh);
	})
	
	//half spheres
	var r9 = new THREE.Vector3(0,				Math.PI/2.,		0);
	var r10 = new THREE.Vector3(-Math.PI/2.,	0,				0);
	var r11 = new THREE.Vector3(0, 				0,				0);
	var r12 = new THREE.Vector3(0, 				-Math.PI/2.,	0);
	var r13 = new THREE.Vector3(Math.PI/2., 	0, 				0);
	var r14 = new THREE.Vector3(Math.PI,		0,			0);

	allP = [p9,p10,p11,p12,p13,p14]
	var allR = [r9,r10,r11,r12,r13,r14]
	allP.forEach(function(p, i){
		var mesh = drawHalfSphere(radius, params.sphereSegments, params.sphereSegments, params.defaultInnerOpacity, params.sphereColor, p, allR[i], params.showAtoms, 'Atoms');
		params.hemiSpheres.push(mesh);
	})


	//Quarter spheres
	var r1 = new THREE.Vector3(0,				Math.PI/2.,		0); 
	var r2 = new THREE.Vector3(0,				0,				0); 
	var r3 = new THREE.Vector3(Math.PI/2.,		Math.PI/2.,		0);  
	var r4 = new THREE.Vector3(Math.PI/2.,		0,				0);
	var r5 = new THREE.Vector3(0,				Math.PI/2.,		-Math.PI/2.); 
	var r6 = new THREE.Vector3(0,				-Math.PI/2.,	0);
	var r7 = new THREE.Vector3(Math.PI/2.,		0,				Math.PI);  
	var r8 = new THREE.Vector3(Math.PI,		0,				0);    
	allP = [p1,p2,p3,p4,p5,p6,p7,p8]
	allR = [r1,r2,r3,r4,r5,r6,r7,r8]
	allP.forEach(function(p, i){
		var mesh = drawQuarterSphere(radius, params.sphereSegments, params.sphereSegments, params.defaultInnerOpacity, params.sphereColor, p, allR[i], params.showAtoms, 'Atoms');
		params.hemiSpheres.push(mesh);
	})

}

function drawOctahedral(){
	//interstitial octahedral sites, touch 6 atoms

	var radius = params.size*Math.sqrt(2)/4.*0.414; 

	//draw the full spheres (this should be from an input file)
	var p1  = new THREE.Vector3(params.size/2., params.size/2., params.size/2.);
	var p2  = new THREE.Vector3(params.size/2., 0, 				0);
	var p3  = new THREE.Vector3(0, 				params.size/2.,	0);
	var p4  = new THREE.Vector3(params.size, 	params.size/2.,	0);
	var p5  = new THREE.Vector3(params.size/2., params.size,	0);
	var p6  = new THREE.Vector3(0, 				0,				params.size/2.);
	var p7  = new THREE.Vector3(params.size, 	0, 				params.size/2.);
	var p8  = new THREE.Vector3(0, 				params.size,	params.size/2.);
	var p9  = new THREE.Vector3(params.size,	params.size,	params.size/2.);
	var p10 = new THREE.Vector3(params.size/2.,	0, 				params.size);
	var p11 = new THREE.Vector3(0, 				params.size/2.,	params.size);
	var p12 = new THREE.Vector3(params.size, 	params.size/2.,	params.size);
	var p13 = new THREE.Vector3(params.size/2.,	params.size,	params.size);

	var allP = [p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.octahedralColor, p, params.showOctahedrals, 'Octahedrals');
		params.spheres.push(mesh);
	})
}

function drawTetrahedral(){
	//interstitial tetrahedral sites, touch 4 atoms

	var radius = params.size*Math.sqrt(2)/4.*0.225; 

	//draw the full spheres (this should be from an input file)
	var p1  = new THREE.Vector3(params.size/4.,   params.size/4.,     params.size/4.);
	var p2  = new THREE.Vector3(params.size/4.,   params.size*3/4.,   params.size/4.);
	var p3  = new THREE.Vector3(params.size/4.,   params.size*3/4.,   params.size*3/4.);
	var p4  = new THREE.Vector3(params.size/4.,   params.size/4.,     params.size*3/4.);
	var p5  = new THREE.Vector3(params.size*3/4., params.size/4.,     params.size/4.);
	var p6  = new THREE.Vector3(params.size*3/4., params.size*3/4.,   params.size/4.);
	var p7  = new THREE.Vector3(params.size*3/4., params.size*3/4.,   params.size*3/4.);
	var p8  = new THREE.Vector3(params.size*3/4., params.size/4.,     params.size*3/4.);


	var allP = [p1,p2,p3,p4,p5,p6,p7,p8]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.tetrahedralColor, p, params.showTetrahedrals, 'Tetrahedrals');
		params.spheres.push(mesh);
	})
}

function drawTriangular(){
	//interstitial triangular sites, touch 3 atoms in a close-packed {111} plane
	//every face of every tetrahedral site is a triangular site (8 tetrahedra x 4 faces = 32, all inside the unit cell)

	var radius = params.size*Math.sqrt(2)/4.*(2./Math.sqrt(3) - 1.); //r/R = 0.155

	//FCC atom positions (corners and face centers)
	var atoms = [];
	[0, 0.5, 1].forEach(function(x){
		[0, 0.5, 1].forEach(function(y){
			[0, 0.5, 1].forEach(function(z){
				if ((2*(x + y + z)) % 2 == 0) atoms.push(new THREE.Vector3(x*params.size, y*params.size, z*params.size));
			});
		});
	});

	//for each tetrahedral site, find its 4 atoms and place a site at the center of each triangular face
	[0.25, 0.75].forEach(function(x){
		[0.25, 0.75].forEach(function(y){
			[0.25, 0.75].forEach(function(z){
				var tet = new THREE.Vector3(x*params.size, y*params.size, z*params.size);
				var neighbors = atoms.filter(function(a){ return a.distanceTo(tet) < 0.45*params.size; }); //nearest atoms are at sqrt(3)/4 a
				for (var i = 0; i < neighbors.length; i++){
					var p = new THREE.Vector3(0, 0, 0);
					neighbors.forEach(function(a, j){ if (j != i) p.add(a); });
					p.divideScalar(3.);
					var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.triangularColor, p, params.showTriangulars, 'Triangulars');
					params.spheres.push(mesh);
				}
			})
		})
	})
}

function drawBond(p0, p1, radius, type){
	//draw a cylinder connecting two points (used in the coordination view)

	var direction = p1.clone().sub(p0);
	var position = p0.clone().add(p1).divideScalar(2.);
	var quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
	var rotation = new THREE.Euler().setFromQuaternion(quaternion);
	var mesh = drawCylinder(radius, direction.length(), params.cylinderRadialSegments, params.cylinderHeightSegments, params.cylinderColor, position, rotation);
	mesh.type = type;
	params.coordination.push(mesh);
}

function drawCoordination(){
	//this is the coordination view.  

	var radius = params.size*Math.sqrt(2)/4.*params.sparseScale;

	///////////////// coordinationAtoms
	//spheres
	//corner
	var p1  = new THREE.Vector3(0, 				0, 				0);

	//middle "ring"
	var p2 = new THREE.Vector3(params.size/2.,	params.size/2.,	0);
	var p3 = new THREE.Vector3(-params.size/2.,	params.size/2.,	0);
	var p4 = new THREE.Vector3(-params.size/2.,	-params.size/2.,	0);
	var p5 = new THREE.Vector3(params.size/2.,	-params.size/2.,	0);

	//top "ring"
	var p6 = new THREE.Vector3(params.size/2.,	0,				params.size/2.);
	var p7 = new THREE.Vector3(0,				params.size/2.,	params.size/2.);
	var p8 = new THREE.Vector3(-params.size/2.,	0,				params.size/2.);
	var p9 = new THREE.Vector3(0,				-params.size/2.,params.size/2.);

	//bottom "ring"
	var p10 = new THREE.Vector3(params.size/2.,	0,				-params.size/2.);
	var p11 = new THREE.Vector3(0,				params.size/2.,	-params.size/2.);
	var p12 = new THREE.Vector3(-params.size/2.,0,				-params.size/2.);
	var p13 = new THREE.Vector3(0,				-params.size/2.,-params.size/2.);


	var allP = [p1, p2,p3,p4,p5, p6,p7,p8,p9, p10,p11,p12,p13]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p, false, 'coordinationSphere');
		mesh.type = "coordinationAtoms";
		params.coordination.push(mesh);
	});

	//cylinders
	//positions
	var n = new THREE.Vector3(2,2,2);
	var p1to2 = p2.clone().sub(p1).divide(n);
	var p1to3 = p3.clone().sub(p1).divide(n);
	var p1to4 = p4.clone().sub(p1).divide(n);
	var p1to5 = p5.clone().sub(p1).divide(n);

	var p1to6 = p6.clone().sub(p1).divide(n);
	var p1to7 = p7.clone().sub(p1).divide(n);
	var p1to8 = p8.clone().sub(p1).divide(n);
	var p1to9 = p9.clone().sub(p1).divide(n);

	var p1to10 = p10.clone().sub(p1).divide(n);
	var p1to11 = p11.clone().sub(p1).divide(n);
	var p1to12 = p12.clone().sub(p1).divide(n);
	var p1to13 = p13.clone().sub(p1).divide(n);

	//lengths
	var h1to2 = p1.clone().sub(p2).length();
	var h1to3 = p1.clone().sub(p3).length();
	var h1to4 = p1.clone().sub(p4).length();
	var h1to5 = p1.clone().sub(p5).length();

	var h1to6 = p1.clone().sub(p6).length();
	var h1to7 = p1.clone().sub(p7).length();
	var h1to8 = p1.clone().sub(p8).length();
	var h1to9 = p1.clone().sub(p9).length();

	var h1to10 = p1.clone().sub(p10).length();
	var h1to11 = p1.clone().sub(p11).length();
	var h1to12 = p1.clone().sub(p12).length();
	var h1to13 = p1.clone().sub(p13).length();


	//rotation (not sure what the algorithm is here...)
	var r1to2 = new THREE.Vector3(0, 0, -Math.atan2(p2.y, p2.x));
	var r1to3 = new THREE.Vector3(0, 0, -Math.atan2(p3.y, p3.x));
	var r1to4 = new THREE.Vector3(0, 0, -Math.atan2(p4.y, p4.x));
	var r1to5 = new THREE.Vector3(0, 0, -Math.atan2(p5.y, p5.x));

	var r1to6 = new THREE.Vector3(0, 						-Math.acos(p6.z/h1to6), 2.*Math.acos(p6.z/h1to6));
	var r1to7 = new THREE.Vector3(Math.acos(p6.z/h1to6), 	-Math.acos(p7.z/h1to7), 0);
	var r1to8 = new THREE.Vector3(0,						Math.acos(p8.z/h1to8), 	2.*Math.acos(p8.z/h1to8));
	var r1to9 = new THREE.Vector3(-Math.acos(p9.z/h1to9), 	0, 						0);

	var r1to10 = new THREE.Vector3(0, 						Math.acos(p6.z/h1to6), 2.*Math.acos(p6.z/h1to6));
	var r1to11 = new THREE.Vector3(-Math.acos(p6.z/h1to6), 	Math.acos(p7.z/h1to7), 0);
	var r1to12 = new THREE.Vector3(0,						-Math.acos(p8.z/h1to8), 	2.*Math.acos(p8.z/h1to8));
	var r1to13 = new THREE.Vector3(Math.acos(p9.z/h1to9), 	0, 						0);

	var allP = [p1to2,p1to3,p1to4,p1to5, p1to6,p1to7,p1to8,p1to9, p1to10,p1to11,p1to12,p1to13]
	var allR = [r1to2,r1to3,r1to4,r1to5, r1to6,r1to7,r1to8,r1to9, r1to10,r1to11,r1to12,r1to13]
	var allH = [h1to2,h1to3,h1to4,h1to5, h1to6,h1to7,h1to8,h1to9, h1to10,h1to11,h1to12,h1to13]
	allP.forEach(function(p,i){
		var mesh = drawCylinder(radius/4., allH[i], params.cylinderRadialSegments, params.cylinderHeightSegments, params.cylinderColor, allP[i], allR[i]);
		mesh.type = "coordinationAtoms";
		params.coordination.push(mesh);
	});




	///////////////// coordinationOctahedrals
	//Octahedral site (0.5-0.5-0.5) is coordinate with 6 atoms atoms at:
	//0.5-0.5-0, 0.5-0.5-1, 0.5-0-0.5, 0.5-1-0.5, 0-0.5-0.5, 1-0.5-0.5.

	//center
	p0 = new THREE.Vector3(params.size/2.,	params.size/2.,	params.size/2.);
	var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.octahedralColor, p0, false, 'coordinationSphere');
	mesh.type = "coordinationOctahedrals";
	params.coordination.push(mesh);

	//spheres
	var p1 = new THREE.Vector3(params.size/2., params.size/2., 0);
	var p2 = new THREE.Vector3(params.size/2., params.size/2., params.size);
	var p3 = new THREE.Vector3(params.size/2., 0,              params.size/2.);
	var p4 = new THREE.Vector3(params.size/2., params.size,    params.size/2.);
	var p5 = new THREE.Vector3(0,              params.size/2., params.size/2.);
	var p6 = new THREE.Vector3(params.size,    params.size/2., params.size/2.);

	var allP = [p1,p2,p3,p4,p5,p6]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p, false, 'coordinationSphere');
		mesh.type = "coordinationOctahedrals";
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
	var r0to1 = new THREE.Vector3(Math.PI/2., 0, 0);
	var r0to2 = new THREE.Vector3(Math.PI/2., 0, 0);
	var r0to3 = new THREE.Vector3(0, 0, 0);
	var r0to4 = new THREE.Vector3(0, 0, 0);
	var r0to5 = new THREE.Vector3(0, 0, Math.PI/2.);
	var r0to6 = new THREE.Vector3(0, 0, Math.PI/2.);

	var allP = [p0to1,p0to2,p0to3,p0to4,p0to5,p0to6]
	var allR = [r0to1,r0to2,r0to3,r0to4,r0to5,r0to6]
	var allH = [h0to1,h0to2,h0to3,h0to4,h0to5,h0to6]
	allP.forEach(function(p,i){
		var mesh = drawCylinder(radius/4., allH[i], params.cylinderRadialSegments, params.cylinderHeightSegments, params.cylinderColor, allP[i], allR[i]);
		mesh.type = "coordinationOctahedrals";
		params.coordination.push(mesh);
	});


	///////////////// coordinationTetrahedrals
	//Tetrahedral site (0.25-0.25-0.25) is coordinate with 4 atoms atoms at:
	//0-0-0, 0.5-0.5-0, 0.5-0-0.5, 0-0.5-0.5

	//center
	p0 = new THREE.Vector3(params.size/4.,	params.size/4.,	params.size/4.);
	var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.tetrahedralColor, p0, false, 'coordinationSphere');
	mesh.type = "coordinationTetrahedrals";
	params.coordination.push(mesh);

	//spheres
	var p1 = new THREE.Vector3(0,              0,              0);
	var p2 = new THREE.Vector3(params.size/2., params.size/2., 0);
	var p3 = new THREE.Vector3(params.size/2., 0,              params.size/2.);
	var p4 = new THREE.Vector3(0,              params.size/2., params.size/2.);


	var allP = [p1,p2,p3,p4]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p, false, 'coordinationSphere');
		mesh.type = "coordinationTetrahedrals";
		params.coordination.push(mesh);
	});

	//cylinders
	//positions
	var n = new THREE.Vector3(2,2,2);
	var p0to1 = p0.clone().add(p1).divide(n);
	var p0to2 = p0.clone().add(p2).divide(n);
	var p0to3 = p0.clone().add(p3).divide(n);
	var p0to4 = p0.clone().add(p4).divide(n);

	//lengths
	var h0to1 = p0.clone().sub(p1).length();
	var h0to2 = p0.clone().sub(p2).length();
	var h0to3 = p0.clone().sub(p3).length();
	var h0to4 = p0.clone().sub(p4).length();


	//rotation (not sure what the algorithm is here...)
	var r0to1 = new THREE.Vector3(0, -Math.PI/4, -Math.acos(p0.z/h0to1));
	var r0to2 = new THREE.Vector3(0,  Math.PI/4, -Math.acos(p0.z/h0to2));
	var r0to3 = new THREE.Vector3(0, -Math.PI/4,  Math.acos(p0.z/h0to3));
	var r0to4 = new THREE.Vector3(0,  Math.PI/4,  Math.acos(p0.z/h0to4));

	var allP = [p0to1,p0to2,p0to3,p0to4]
	var allR = [r0to1,r0to2,r0to3,r0to4]
	var allH = [h0to1,h0to2,h0to3,h0to4]
	allP.forEach(function(p,i){
		var mesh = drawCylinder(radius/4., allH[i], params.cylinderRadialSegments, params.cylinderHeightSegments, params.cylinderColor, allP[i], allR[i]);
		mesh.type = "coordinationTetrahedrals";
		params.coordination.push(mesh);
	});


	///////////////// coordinationTriangulars
	//Triangular site (1/3-1/3-1/3) is coordinate with 3 atoms in the (111) plane at:
	//0.5-0.5-0, 0.5-0-0.5, 0-0.5-0.5

	//center
	p0 = new THREE.Vector3(params.size/3.,	params.size/3.,	params.size/3.);
	var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.triangularColor, p0, false, 'coordinationSphere');
	mesh.type = "coordinationTriangulars";
	params.coordination.push(mesh);

	//spheres
	var p1 = new THREE.Vector3(params.size/2., params.size/2., 0);
	var p2 = new THREE.Vector3(params.size/2., 0,              params.size/2.);
	var p3 = new THREE.Vector3(0,              params.size/2., params.size/2.);

	var allP = [p1,p2,p3]
	allP.forEach(function(p){
		var mesh = drawSphere(radius, params.sphereSegments, params.sphereSegments, params.hardOpacity, params.sphereColor, p, false, 'coordinationSphere');
		mesh.type = "coordinationTriangulars";
		params.coordination.push(mesh);
		drawBond(p0, p, radius/4., "coordinationTriangulars");
	});

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
