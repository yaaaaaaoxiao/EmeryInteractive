//this file contains all the functions needed for the slice view

//draw the slice view
//https://jsfiddle.net/8uxw667m/4/
//https://stackoverflow.com/questions/42348495/three-js-find-all-points-where-a-mesh-intersects-a-plane/42353447
function drawSlice(size, position, rotation, opacity, color){

	var pointsOfIntersection;
	var objs = [];
	var check = 0;

	function setPointOfIntersection(line, plane, minDistance) {
		//find the intersection points between then plan and the spheres

		var pointOfIntersection = new THREE.Vector3();
		plane.intersectLine(line, pointOfIntersection);
		//find the minimum distance so that I don't add so many points! (slows things down a bit here, but I think this is needed)
		var minD = minDistance*1000.;
		pointsOfIntersection.vertices.forEach(function(p,i){
			var d = pointOfIntersection.distanceTo(p)
			if (d < minD){
				minD = d;
			}
		})
		if (pointOfIntersection) {
			if (pointOfIntersection.distanceTo(new THREE.Vector3(0,0,0)) != 0  && minD > minDistance){//some failure mode for this at 0,0,0
				pointsOfIntersection.vertices.push(pointOfIntersection.clone());
				pointsOfIntersection.center.add(pointOfIntersection.clone());
			}
		};
	}


	function sortPoints(plane, obj){
		//sort the points so that we can draw the outline of the sliced surface

		//get the center of the sphere
		var center = new THREE.Vector3();
		obj.geometry.computeBoundingBox();   
		obj.geometry.boundingBox.getCenter(center);
		obj.localToWorld( center );

		//get the normal of the plane
		var normal = plane.geometry.faces[0].normal;

		//populate the indices and also copy over the vertices so that I can resort them later
		var indices = [];
		var vertices = [];
		pointsOfIntersection.vertices.forEach(function(p,i){
			indices.push(i);
			vertices.push(p.clone());
		})


		//sort the indices
		indices.sort(function (i, j) { 
			//https://stackoverflow.com/questions/14370636/sorting-a-list-of-3d-coplanar-points-to-be-clockwise-or-counterclockwise
			var A = vertices[i].clone().sub(center);
			var B = vertices[j].clone().sub(center);
			var C = A.cross(B);
			return normal.dot(C)

		});
		//update the vertices
		var j = 0;
		indices.forEach(function(i,j){
			pointsOfIntersection.vertices[j].copy(vertices[i]);
		})
		//add the first point on to close the loop (need to do this twice for some reason)
		if (indices.length > 0){
			pointsOfIntersection.vertices.push(vertices[indices[0]]);
			pointsOfIntersection.vertices.push(vertices[indices[0]]);
			pointsOfIntersection.vertices.needsUpdate = true;
		}

		//try to check this
		// console.log(pointsOfIntersection.vertices)
		// // pointsOfIntersection.vertices.forEach(function(v,i){
		// // 	if (i < pointsOfIntersection.vertices.length-2){
		// // 		var A = v.clone().sub(center);
		// // 		var B = pointsOfIntersection.vertices[i+1].clone().sub(center);
		// // 		var C = A.cross(B);
		// // 		console.log(normal.dot(C))
		// // 	}
		// // })
		// indices.forEach(function(i, j){
		// 	if (j < indices.length-2){
		// 		var v1 = vertices[indices[j]];
		// 		var v2 = vertices[indices[j+1]]
		// 		var A = v1.clone().sub(center);
		// 		var B = v2.clone().sub(center);
		// 		var C = A.cross(B);
		// 		console.log(i,  j, indices[j], indices[j+1], normal.dot(C))
		// 	}
		// })

		
		return center
	}

	function makeMathPlane(plane){

		var planePointA = new THREE.Vector3(),
			planePointB = new THREE.Vector3(),
			planePointC = new THREE.Vector3();
		var lineAB = new THREE.Line3(),
			lineBC = new THREE.Line3(),
			lineCA = new THREE.Line3();


		var mathPlane = new THREE.Plane();
		plane.localToWorld(planePointA.copy(plane.geometry.vertices[plane.geometry.faces[0].a]));
		plane.localToWorld(planePointB.copy(plane.geometry.vertices[plane.geometry.faces[0].b]));
		plane.localToWorld(planePointC.copy(plane.geometry.vertices[plane.geometry.faces[0].c]));
		mathPlane.setFromCoplanarPoints(planePointA, planePointB, planePointC);	

		return mathPlane;
	}

	function drawIntersectionPoints(mathPlane, obj, minDistance) {
		//get the intersection and draw it (using above functions)

		var a = new THREE.Vector3(),
			b = new THREE.Vector3(),
			c = new THREE.Vector3();

		obj.geometry.faces.forEach(function(face) {
			obj.localToWorld(a.copy(obj.geometry.vertices[face.a]));
			obj.localToWorld(b.copy(obj.geometry.vertices[face.b]));
			obj.localToWorld(c.copy(obj.geometry.vertices[face.c]));
			lineAB = new THREE.Line3(a, b);
			lineBC = new THREE.Line3(b, c);
			lineCA = new THREE.Line3(c, a);
			setPointOfIntersection(lineAB, mathPlane, minDistance);
			setPointOfIntersection(lineBC, mathPlane, minDistance);
			setPointOfIntersection(lineCA, mathPlane, minDistance);
		});



		//sort the points around a object .
		sortPoints(plane, obj);
		
		if (pointsOfIntersection.vertices.length > 2){
			var lineMaterial = new THREE.LineBasicMaterial( { 
				color: "red",
				visible:false
			}) ;
			var line = new THREE.Line( pointsOfIntersection, lineMaterial );
			params.scene.add( line );
			objs.push(line);

			var N = pointsOfIntersection.vertices.length;
			pointsOfIntersection.center.divide(new THREE.Vector3(N,N,N));

			//in case we want to see the points
			// var pointsMaterial = new THREE.PointsMaterial({
			// 	size: 0.1,
			// 	color: "red"
			// });
			// var points = new THREE.Points(pointsOfIntersection, pointsMaterial);
			// params.scene.add(points);

		}
  
	}

	////////////////////

	//define the plane
	var geometry = new THREE.PlaneGeometry( size, size, 1 );
	var material = new THREE.MeshBasicMaterial( {
		color: color, 
		side: THREE.DoubleSide,
		transparent:true,
		opacity:opacity, 
		visible:false,
		depthTest:false,
		depthWrite:true,
	});


	var plane = new THREE.Mesh( geometry, material );
	plane.renderOrder = 1; //so that we see everything through it, regardless of camera location!
	plane.position.set(position.x, position.y, position.z);
	plane.rotation.set(rotation.x, rotation.y, rotation.z);
	//update the vertices of the plane geometry so that I can check for the intersection
	//https://stackoverflow.com/questions/23990354/how-to-update-vertices-geometry-after-rotate-or-move-object
	plane.updateMatrix();
	plane.geometry.applyMatrix( plane.matrix );
	plane.matrix.identity();
	plane.position.set( 0, 0, 0 );
	plane.rotation.set( 0, 0, 0 );
	plane.scale.set( 1, 1, 1 );
	plane.geometry.computeFaceNormals()
	var normal = plane.geometry.faces[0].normal;

	params.slicePlane = plane;
	params.slicePlanePosition = position;
	updateSlicePlaneDepth();
	params.scene.add( plane );

	var edges = new THREE.EdgesGeometry( geometry );
	var material = new THREE.LineBasicMaterial( {
		color: "red",
		visible: false,
	});
	var planeLine = new THREE.LineSegments( edges,  material);
	params.scene.add(planeLine);

	var mathPlane = makeMathPlane(plane);

	//check each sphere for intersection with the plane
	var names = [];
	if (params.showAtoms) names.push('Atoms')
	if (params.showTetrahedrals) names.push('Tetrahedrals')
	if (params.showOctahedrals) names.push('Octahedrals')
	if (params.showTriangulars) names.push('Triangulars')
	params.spheres.forEach(function(m,i){ 
		if (names.indexOf(m.name) != -1){
			//this is an interesting package, but doesn't seem to work well enough for our purposes
			// var planeBSP = new ThreeBSP(plane);
			// var sphereBSP = new ThreeBSP(m);
			// var intersectBSP = planeBSP.intersect(sphereBSP);
			// var mesh = intersectBSP.toMesh(material);
			// params.scene.add( mesh );


			var box = new THREE.Box3().setFromObject( m );
			var size = new THREE.Vector3();
			box.getSize(size);
			var minDistance = (size.x + size.y + size.z)/3.* 0.001;

			pointsOfIntersection = new THREE.Geometry();
			pointsOfIntersection.center = new THREE.Vector3(0,0,0);
			drawIntersectionPoints(mathPlane, m, minDistance);

			if (pointsOfIntersection.vertices.length > 0){
				//add the objects that have any intersection
				//I will do this in two steps pieces
				//First: I will get a convex Geometry of the object.  This apparently doesn't look good right at the intersection
				// -- I will clean up the convex geometry by adjusting normals and removing the face that hits the plane
				//Second: I will draw a flat geometry at the surface of intersection
				//These will be combined into a single geometry that is then shown to the viewer
				//I don't know how easily this will work in another setup...


				//create a list of vertices for the intersection to use in convex geometry
				m.intersected = true;
				vertices = [];
				m.geometry.vertices.forEach(function(v){
					p = v.clone().add(m.position).sub(position)
					if (p.dot(normal) <= 0){
						vertices.push(v)
					}
				})

				pointsOfIntersection.vertices.forEach(function(v){
					vertices.push(v.clone().sub(m.position));
				})
				var gC = new THREE.ConvexGeometry( vertices );
				gC.computeVertexNormals();
				gC.computeFaceNormals();

				//some of these normals are not coming our correctly... I will try to fix that here
				// If I could find the same point on the initial sphere, I could replace the normal with that...
				//I will also delete the front face here
				toDelete = [];
				var n0 = new THREE.Vector3(1,0,0);
				var dmin = 1e-4*params.size; //limit to associate two vertices
				gC.faces.forEach(function(f,i){
					var d = f.normal.dot(normal);
					if (d > (1 - 1e-4)){ //delete the front face
						toDelete.push(i);
					}


					var vA = gC.vertices[f.a].clone();
					var vB = gC.vertices[f.b].clone();
					var vC = gC.vertices[f.c].clone();
					var vFaceCenter = (vA.add(vB).add(vC)).divideScalar(3);

					f.vertexNormals.forEach(function(n,j){
						//gC.faces[i].vertexNormals[j].copy(vFaceCenter); //this would work, but then we get the pixels and not smooth faces
						//find the minimum distance to the intersection surface (slows things down a bit here, but I think this is needed)
						var minD = minDistance*1000.;
						pointsOfIntersection.vertices.forEach(function(p,k){
							p0 = p.clone().sub(m.position);
							var dA = vA.distanceTo(p0);
							var dB = vB.distanceTo(p0);
							var dC = vC.distanceTo(p0);
							var d = Math.min(dC, Math.min(dA,dB));
							if (d < minD){
								minD = d;
							}
						})
						var d = n.dot(normal);
						if (d > 0. && minD < minDistance*1e-4*params.size){
							//var n0 = m.position.clone().sub(vFaceCenter);
							gC.faces[i].vertexNormals[j].copy(vFaceCenter);
						}
					})
					

				})
				toDelete.forEach(function(i){
					delete gC.faces[i];
				})
				gC.faces = gC.faces.filter( function(v) { return v; });
				gC.elementsNeedUpdate = true; // update faces
				gC.normalsNeedUpdate = true;

				//create a surface using the pointsOfIntersection and drawing triangles
				//get the center

				var gF = new THREE.Geometry();
				gF.vertices.push(pointsOfIntersection.vertices[0].clone().sub(m.position));
				pointsOfIntersection.vertices.forEach(function(v,i){
					if (i > 0){
						gF.vertices.push(pointsOfIntersection.center.clone().sub(m.position));
						gF.vertices.push(pointsOfIntersection.vertices[i].clone().sub(m.position));
					}
					offset = i * 2;
					if (2+offset < 2*pointsOfIntersection.vertices.length){
						gF.faces.push(new THREE.Face3(0 + offset, 1 + offset, 2 + offset));
					}
				})
				gF.computeVertexNormals();

				//combine these into a single geometry
				var singleGeometry = new THREE.Geometry();

				var mesh = new THREE.Mesh(gC)
				mesh.updateMatrix();
				singleGeometry.merge(mesh.geometry, mesh.matrix);

				mesh = new THREE.Mesh(gF)
				mesh.updateMatrix();
				singleGeometry.merge(mesh.geometry, mesh.matrix);


				mesh = new THREE.Mesh(singleGeometry, m.material.clone());

				mesh.position.set(m.position.x, m.position.y, m.position.z)
				mesh.rotation.set(m.rotation.x, m.rotation.y, m.rotation.z)
				mesh.material.opacity = params.hardOpacity;
				//mesh.material.wireframe = true;
				mesh.material.visible = false;
				mesh.side = THREE.DoubleSide;
				params.scene.add(mesh)
				objs.push(mesh)

				//to see the normals
				// var helper = new THREE.VertexNormalsHelper( mesh, 0.1, "red", 1 );
				// var helper = new THREE.FaceNormalsHelper( mesh, 0.1, "red", 1 );
				// params.scene.add(helper)


			} else {
				//those that don't (and only take those behind plane)
				var p = m.position.clone().sub(position)
				if (p.dot(normal) < 0){
					m.intersected = false;
					var mesh = new THREE.Mesh(m.geometry.clone(), m.material.clone());
					mesh.material.opacity = params.hardOpacity;
					mesh.material.visible = false;
					mesh.position.set(m.position.x, m.position.y, m.position.z)
					mesh.rotation.set(m.rotation.x, m.rotation.y, m.rotation.z)
					params.scene.add(mesh)
					objs.push(mesh)
				}
			}
		}
	});


	return {
		"plane":plane,
		"planeLine":planeLine,
		"mesh":objs,
	}

}
