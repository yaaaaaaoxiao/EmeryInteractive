//This file contains all the functions needed to draw the individual objects.  draw.js uses this file heavily.

function drawSphere(radius, widthSegments, heightSegments, opacity, color, position, visible = true, name = "sphere"){
	//draw a full sphere

	var geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments, 0, 2.*Math.PI, 0, Math.PI)
	var material = new THREE.MeshPhongMaterial( { 
		color: color, 
		flatShading: false, 
		transparent:true,
		opacity:opacity, 
		visible:visible
		//shininess:50,
	});

	sphere = new THREE.Mesh( geometry, material );
	sphere.position.set(position.x, position.y, position.z)
	sphere.name = name;
	//update the vertices of the plane geometry so that I can check for the intersection -- not needed (and also breaks the sparse view)
	//https://stackoverflow.com/questions/23990354/how-to-update-vertices-geometry-after-rotate-or-move-object
	// sphere.updateMatrix();
	// sphere.geometry.applyMatrix( sphere.matrix );
	// sphere.matrix.identity();
	// sphere.position.set( 0, 0, 0 );
	// sphere.rotation.set( 0, 0, 0 );
	// sphere.scale.set( 1, 1, 1 );

	params.scene.add( sphere );
	
	return sphere;

}

function drawHalfSphere(radius, widthSegments, heightSegments, opacity, color, position, rotation, visible = true, name = 'halfSpheref'){
	//draw a half sphere

	var sphere = new THREE.SphereGeometry(radius, widthSegments, heightSegments, 0, Math.PI, 0, Math.PI)
	var circle = new THREE.CircleGeometry(radius, widthSegments, 0., 2.*Math.PI)

	var sphereMesh = new THREE.Mesh(sphere);
	var circleMesh = new THREE.Mesh(circle);

	var singleGeometry = new THREE.Geometry();

	sphereMesh.updateMatrix(); // as needed
	singleGeometry.merge(sphereMesh.geometry, sphereMesh.matrix);

	circleMesh.updateMatrix(); // as needed
	singleGeometry.merge(circleMesh.geometry, circleMesh.matrix);

	var material = new THREE.MeshPhongMaterial( { 
		color: color, 
		flatShading: false, 
		transparent:true,
		//shininess:50,
		opacity:opacity, 
		side:THREE.DoubleSide,
	});

	var mesh = new THREE.Mesh(singleGeometry, material);
	mesh.name = name;
	mesh.position.set(position.x, position.y, position.z);
	mesh.rotation.set(rotation.x, rotation.y, rotation.z);
	mesh.renderOrder = -1;
	params.scene.add(mesh);

	return mesh;

}

function drawQuarterSphere(radius, widthSegments, heightSegments, opacity, color, position, rotation, visible = true, name = 'quarterSphere'){
	//draw a quarter sphere

	var sphere = new THREE.SphereGeometry(radius, widthSegments, heightSegments, 0, Math.PI/2., 0, Math.PI/2.)
	var circle1 = new THREE.CircleGeometry(radius, widthSegments, 0., Math.PI/2.)
	var circle2 = new THREE.CircleGeometry(radius, widthSegments, 0., Math.PI/2.)
	var circle3 = new THREE.CircleGeometry(radius, widthSegments, 0., Math.PI/2.)

	var sphereMesh = new THREE.Mesh(sphere);

	var circle1Mesh = new THREE.Mesh(circle1);
	circle1Mesh.rotation.set(0, 0, Math.PI/2.);

	var circle2Mesh = new THREE.Mesh(circle2);
	circle2Mesh.rotation.set(Math.PI/2., 0, Math.PI/2.);

	var circle3Mesh = new THREE.Mesh(circle3);
	circle3Mesh.rotation.set(Math.PI/2., Math.PI/2., 0);

	var singleGeometry = new THREE.Geometry();

	sphereMesh.updateMatrix(); // as needed
	singleGeometry.merge(sphereMesh.geometry, sphereMesh.matrix);

	circle1Mesh.updateMatrix(); // as needed
	singleGeometry.merge(circle1Mesh.geometry, circle1Mesh.matrix);

	circle2Mesh.updateMatrix(); // as needed
	singleGeometry.merge(circle2Mesh.geometry, circle2Mesh.matrix);

	circle3Mesh.updateMatrix(); // as needed
	singleGeometry.merge(circle3Mesh.geometry, circle3Mesh.matrix);

	var material = new THREE.MeshPhongMaterial( { 
		color: color, 
		flatShading: false, 
		transparent:true,
		//shininess:50,
		opacity:opacity, 
		side:THREE.DoubleSide,
	});

	var mesh = new THREE.Mesh(singleGeometry, material);
	mesh.name = name;
	mesh.position.set(position.x, position.y, position.z);
	mesh.rotation.set(rotation.x, rotation.y, rotation.z);
	mesh.renderOrder = -1;
	params.scene.add(mesh);

	return mesh;

}



function drawCylinder(radius, height, radialSegments, heightSegments, color, position, rotation, visible = false, name = 'cylinder'){
	//draw a cylinder

	var geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, heightSegments);

	var material = new THREE.MeshPhongMaterial( { 
		color: color, 
		flatShading: false, 
		transparent:false,
		visible:visible
	});

	cylinder = new THREE.Mesh( geometry, material );
	cylinder.name = name;
	cylinder.position.set(position.x, position.y, position.z)
	cylinder.rotation.set(rotation.x, rotation.y, rotation.z)

	params.scene.add( cylinder );
	
	return cylinder;
}



function drawBox(name = 'box'){
	//draw the outside box

	var geometry = new THREE.BoxBufferGeometry( params.size, params.size, params.size);

	var edges = new THREE.EdgesGeometry( geometry );
	var material = new THREE.LineBasicMaterial( {color: 0x000000} )
	var line = new THREE.LineSegments( edges,  material);
	line.position.set(params.size/2, params.size/2., params.size/2.);
	line.name = name;
	params.scene.add( line );

}

function drawAxes(){
	//draw the outside axes
	//The X axis is orange. The Y axis is green. The Z axis is blue.

	var cubeAxis = new THREE.AxesHelper(1.5*params.size);
	cubeAxis.position.set(0,0,0);
	params.scene.add( cubeAxis );

	//add cones to the tops of the axes (for emphasis) -- matching the colors for the axes
	var gX = new THREE.ConeGeometry( params.size/30., params.size/10., 16, 1 );
	var mX = new THREE.MeshBasicMaterial( {color: new THREE.Color(1, 0.6, 0)} );
	var cX = new THREE.Mesh( gX, mX );
	cX.position.set(1.5*params.size, 0, 0);
	cX.rotation.set(0, 0, -Math.PI/2);
	cX.name = 'x-axis';
	params.scene.add( cX );

	var gY = new THREE.ConeGeometry( params.size/30., params.size/10., 16, 1 );
	var mY = new THREE.MeshBasicMaterial( {color: new THREE.Color(0.6, 1, 0)} );
	var cY = new THREE.Mesh( gY, mY );
	cY.position.set(0, 1.5*params.size, 0);
	cY.rotation.set(0, 0, 0);
	cY.name = 'y-axis';
	params.scene.add( cY );

	var gZ = new THREE.ConeGeometry( params.size/30., params.size/10., 16, 1 );
	var mZ = new THREE.MeshBasicMaterial( {color: new THREE.Color(0, 0.6, 1)} );
	var cZ = new THREE.Mesh( gZ, mZ );
	cZ.position.set(0, 0, 1.5*params.size);
	cZ.rotation.set(Math.PI/2, 0, 0);
	cZ.name = 'z-axis';
	params.scene.add( cZ );

	//add font to the axes
	var loader = new THREE.FontLoader();

	loader.load( params.fontFile, function ( font ) {

		var gX = new THREE.TextGeometry( 'x', {
			font: font,
			size: params.size/10.,
			height: params.size/100.,
			curveSegments: 12,
			bevelEnabled: false,
		} );
		var mX = new THREE.MeshBasicMaterial( {color: "black"} );
		var tX = new THREE.Mesh( gX, mX );
		tX.position.set(1.6*params.size, -params.size/30., -params.size/30.);
		params.scene.add(tX);
		params.text.push(tX);

		var gY = new THREE.TextGeometry( 'y', {
			font: font,
			size: params.size/10.,
			height: params.size/100.,
			curveSegments: 12,
			bevelEnabled: false,
		} );
		var mY = new THREE.MeshBasicMaterial( {color: "black"} );
		var tY = new THREE.Mesh( gY, mY );
		tY.position.set(params.size/30., 1.6*params.size, -params.size/30.);
		params.scene.add(tY);
		params.text.push(tY);

		var gZ = new THREE.TextGeometry( 'z', {
			font: font,
			size: params.size/10.,
			height: params.size/100.,
			curveSegments: 12,
			bevelEnabled: false,
		} );
		var mZ = new THREE.MeshBasicMaterial( {color: "black"} );
		var tZ = new THREE.Mesh( gZ, mZ );
		tZ.position.set(params.size/30, -params.size/30, 1.6*params.size, );
		params.scene.add(tZ);
		params.text.push(tZ);

		updateTextRotation();

	} );


}

function drawLabels(){
	// the two labels (a and r)

	var loader = new THREE.FontLoader();

	loader.load( params.fontFile, function ( font ) {

		var g = new THREE.TextGeometry( 'a', {
			font: font,
			size: params.size/10.,
			height: params.size/100.,
			curveSegments: 12,
			bevelEnabled: false,
		} );
		var m = new THREE.MeshBasicMaterial( {color: "red"} );
		var a = new THREE.Mesh( g, m );
		a.position.set(1.04*params.size + params.size/20, 1.04*params.size, params.size/2.);
		params.scene.add(a);
		params.labels.push(a);
		params.text.push(a);

		var g = new THREE.TextGeometry( 'r', {
			font: font,
			size: params.size/10.,
			height: params.size/100.,
			curveSegments: 12,
			bevelEnabled: false,
		} );
		var m = new THREE.MeshBasicMaterial( {color: "black"} );
		var r = new THREE.Mesh( g, m );
		r.position.set(1.04*params.size, params.size/8., -params.size/10.);
		params.scene.add(r);
		params.labels.push(r);
		params.text.push(r);

		// var g = new THREE.TextGeometry( '0', {
		// 	font: font,
		// 	size: params.size/15.,
		// 	height: params.size/100.,
		// 	curveSegments: 12,
		// 	bevelEnabled: false,
		// } );
		// var m = new THREE.MeshBasicMaterial( {color: "black"} );
		// var r0 = new THREE.Mesh( g, m );
		// r0.position.set(1.04*params.size, params.size/8. + params.size/30., -params.size/10. - params.size/30.);
		// params.scene.add(r0);
		// params.labels.push(r0);
		// params.text.push(r0);

		updateTextRotation();
	});

	var g = new THREE.Geometry();
	g.vertices.push(
		new THREE.Vector3(params.size, params.size, 0 ),
		new THREE.Vector3(params.size, params.size, params.size ),
	);
	var m = new THREE.MeshBasicMaterial( {color: "red"} );
	var line = new THREE.Line( g, m );
	params.scene.add( line );
	params.labels.push(line);

}
