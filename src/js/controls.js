function resizeControls(vHeight, controlsWidth, m, b){
	console.log('resizeControls', vHeight, controlsWidth, m, b)
	d3.select("#controlsContainer")
		.style('position','absolute')
		.style('top',m + 'px')
		.style('left',m +'px')
		.style('padding',0)
		//.style('padding-top','2px')
		//.style('padding-right','20px') //to allow for a srollbar
		.style('margin',0)
		.style('width', controlsWidth +'px')
		.style('height',vHeight + 2.*b + 2.*m + 'px')
		.style('overflow-y','auto')
		.style('overflow-x','hidden')
		.style('z-index',2)

	d3.select('#Controls').remove()
	if (d3.select('#Controls').node() == null){
		var parent = d3.select('#controlsContainer').append('div').attr('id','Controls');
		var width = controlsWidth;
		if (parseFloat(window.innerHeight) < 755) width -= 10; //10px to allow for the scrollbar
		setupControls(parent, vHeight, width, m, b); 
	}

}
function setupControls(parent, vHeight, controlsWidth, m, b, pad){

	var fs1 = 18;

	function createInput(parent1, id, value, width, height, top, left, fontsize){
		parent1.append('input')
			.attr('id',id)
			.attr('type','text')
			.attr('placeholder',value)
			.attr('autocomplete','off')
			.style('position','absolute')
			.style('top',top + 'px')
			.style('left',left + 'px')
			.style('margin',0)
			.style('padding',0)
			.style('font-size',fontsize + 'px')
			.style('width',width + 'px' )
			.style('height',height + 'px')
			.on('keypress',function(){
				var key = event.keyCode || event.which;
				if (key == 13) checkControlsText(this.id, this.value);
			})	
	}

	function createButton(parent1, id, width, height, top, left, text='Submit'){
		parent1.append('div')
			.attr('id',id)
			.attr('class','buttonDivControls')
			.classed('buttonClickedControls', false)
			.classed('buttonHoverControls', true)
			.style('position', 'absolute')
			.style('top', top + 'px')
			.style('left', left + 'px')
			.style('width', width+ 'px')
			.style('height',height + 'px')
			.style('line-height', height + 'px')
			.text(text)
			.on('mousedown', function(){
				d3.select('#'+id).classed('buttonHoverControls', false);
				d3.select('#'+id).classed('buttonClickedControls', true);
			})
			.on('mouseup', function(){
				d3.select('#'+id).classed('buttonClickedControls', false);
			})
			.on('mouseout', function(){
				d3.select('#'+id).classed('buttonHoverControls', true);
			})
	}

	//width of the input boxes
	var miWidth = (controlsWidth - 5.*m)/4.;
	var bh = 24 + fs1 - m;
	var bh0 = bh;

	//question input, start,  stop
	var question = parent.append('div')
		.attr('id','questionControls')
		.style('margin',m + 'px')
		.style('height','35px')
	question.append('p')
		.attr('id','questionControlsText')
		.attr('align','center')
		.style('margin',0)
		.style('padding',0)
		.style('font-size',fs1 + 'px')
		.text('Question #')
	createInput(question, 'questionNumber', '-', miWidth, 2.*fs1,  bh, 10, 20)
	createButton(question, 'questionButton', 2.*miWidth + m, 2*fs1 - 4, bh, miWidth + 2*m, 'Start')
	d3.select('#questionButton').on('click', startQuestion)

	//lattice position
	bh += bh0 + 24 + fs1 + m;
	var latticePosition = parent.append('div')
		.attr('id','latticePositionControls')
		.style('margin',m + 'px')
		.style('margin-top','45px') 
		.style('height','70px')
	latticePosition.append('p')
		.attr('id','latticePositionControlsText')
		.attr('align','center')
		.style('margin',0)
		.style('padding',0)
		.style('font-size',fs1 + 'px')
		.text('Lattice Position: q r s')
	createInput(latticePosition, 'latticePositionQ', 'q', miWidth, 2.*fs1, bh, m, 20)
	createInput(latticePosition, 'latticePositionR', 'r', miWidth, 2.*fs1, bh, miWidth + 2*m, 20)
	createInput(latticePosition, 'latticePositionS', 's', miWidth, 2.*fs1, bh, 2.*miWidth + 3*m, 20)
	createButton(latticePosition, 'latticePositionSubmit', miWidth, 2.*fs1 - 4, bh, 3.*miWidth + 4*m, 'Go')
	d3.select('#latticePositionSubmit').on('click', setLatticePositionIndex)

	//lattice direction
	bh += bh0 + 24 + fs1 + m;
	var latticeDirection = parent.append('div')
		.attr('id','latticeDirectionControls')
		.style('margin',m + 'px')
		.style('margin-top','15px') 
		.style('height','70px')
	latticeDirection.append('p')
		.attr('id','latticeDirectionControlsText')
		.attr('align','center')
		.style('margin',0)
		.style('padding',0)
		.style('font-size',fs1 + 'px')
		.text('Lattice Direction: [u v w]')
	createInput(latticeDirection, 'latticeDirectionU', 'u', miWidth, 2.*fs1, bh, m, 20)
	createInput(latticeDirection, 'latticeDirectionV', 'v', miWidth, 2.*fs1, bh, miWidth + 2*m, 20)
	createInput(latticeDirection, 'latticeDirectionW', 'w', miWidth, 2.*fs1, bh, 2.*miWidth + 3*m, 20)
	createButton(latticeDirection, 'latticeDirectionSubmit', miWidth, 2.*fs1 - 4, bh, 3.*miWidth + 4*m, 'Go')
	d3.select('#latticeDirectionSubmit').on('click', setLatticeDirectionIndex)

	//lattice plane
	bh += bh0 + 24 + fs1 + m;
	var latticePlane = parent.append('div')
		.attr('id','latticePlaneControls')
		.style('margin',m + 'px')
		.style('margin-top','15px') 
		.style('height','70px')
	latticePlane.append('p')
		.attr('id','latticePlaneControlsText')
		.attr('align','center')
		.style('margin',0)
		.style('padding',0)
		.style('font-size',fs1 + 'px')
		.text('Lattice Plane: (h k l)')
	createInput(latticePlane, 'latticePlaneH', 'h', miWidth, 2.*fs1, bh, m, 20)
	createInput(latticePlane, 'latticePlaneK', 'k', miWidth, 2.*fs1, bh, miWidth + 2*m, 20)
	createInput(latticePlane, 'latticePlaneL', 'l', miWidth, 2.*fs1, bh, 2.*miWidth + 3*m, 20)
	createButton(latticePlane, 'latticePlaneSubmit', miWidth, 2.*fs1 - 4, bh, 3.*miWidth + 4*m, 'Go')
	d3.select('#latticePlaneSubmit').on('click', setLatticePlaneIndex)



	//mirroring
	bh += bh0 + 24 + fs1 + m;
	var mirror = parent.append('div')
		.attr('id','mirrorControls')
		.style('margin',m + 'px')
		.style('margin-top','15px') 
		.style('height','30px')
	mirror.append('p')
		.attr('id','mirrorControlsText')
		.attr('align','center')
		.style('margin',0)
		.style('padding',0)
		.style('font-size',fs1 + 'px')
		.text('Mirroring')
	createInput(mirror, 'mirrorX', '-', miWidth, 2.*fs1, bh, m, 20)
	createInput(mirror, 'mirrorY', '-', miWidth, 2.*fs1, bh, miWidth + 2*m, 20)
	createInput(mirror, 'mirrorZ', '-', miWidth, 2.*fs1, bh, 2.*miWidth + 3*m, 20)
	createButton(mirror, 'mirrorSubmit', miWidth, 2.*fs1 - 4, bh, 3.*miWidth + 4*m, 'Go')
	d3.select('#mirrorSubmit').on('click', setMirror)


	//tooltip on/off
	bh += bh0  + fs1;
	var additional = parent.append('div')
		.attr('id','tooltipControls')
		.style('margin',m + 'px')
		.style('margin-top','65px') 
		.style('height','65px')
	additional.append('p')
		.attr('id','tooltipsControlsText')
		.attr('align','center')
		.style('margin',0)
		.style('padding',0)
		.style('font-size',fs1 + 'px')
		.text('Additional Controls')	
	var sz = 22.
	createButton(additional, 'tooltipButton',controlsWidth - 20 - 4, sz, bh + 2.*sz + m, m ,'Tooltips On')
	d3.select('#tooltipButton')
		.classed('buttonClickedControls', params.showTooltips)
		.on('click', checkTooltips)

	//on/off for main atoms
	createButton(additional, 'atomButton',controlsWidth - 20 - 4, sz, bh + 3.*sz + 2.*m, m ,'Atoms On')
	d3.select('#atomButton')
		.classed('buttonClickedControls', params.showAtoms)
		.on('click', function(){checkAtoms('showAtoms', 'Atoms', 'atomButton')})

	//on/off for interstitial sites
	var label = "Octahedral Off";
	if (params.mol == 'SC') label = "Cubic Off"
	createButton(additional, 'octahedralButton',controlsWidth - 20 - 4, sz, bh + 4.*sz + 3.*m, m ,label)
	d3.select('#octahedralButton')
		.classed('buttonClickedControls', params.showOctahedrals)
		.on('click', function(){checkAtoms('showOctahedrals', 'Octahedrals', 'octahedralButton')})

	if (params.mol != 'SC'){
		createButton(additional, 'tetrahedralButton',controlsWidth - 20 - 4, sz, bh + 5.*sz + 4.*m, m ,'Tetrahedral Off')
		d3.select('#tetrahedralButton')
			.classed('buttonClickedControls', params.showTetrahedrals)
			.on('click', function(){checkAtoms('showTetrahedrals', 'Tetrahedrals', 'tetrahedralButton')})
	}

	if (params.mol == 'FCC'){
		createButton(additional, 'triangularButton',controlsWidth - 20 - 4, sz, bh + 6.*sz + 5.*m, m ,'Triangular Off')
		d3.select('#triangularButton')
			.classed('buttonClickedControls', params.showTriangulars)
			.on('click', function(){checkAtoms('showTriangulars', 'Triangulars', 'triangularButton')})
	}
}

function checkControlsText(id, value){
	console.log(id, value)
	if (id.includes('latticePlane')) setLatticePlaneIndex();
	if (id.includes('mirror')) setMirror();
}

function startQuestion(){
	params.inQuestion = !params.inQuestion
	var label = ""
	if (params.inQuestion){
		d3.select('#questionButton')
			.classed('buttonClickedControls', true)
			.text('Stop');
		params.questionN = d3.select('#questionNumber').node().value;
		label = 'Started Question ' + params.questionN;
	} else {
		d3.select('#questionButton')
			.classed('buttonClickedControls', false)
			.text('Start');
		label = 'Stopped Question'
	}

	console.log(label);
	ga('send', { 
		hitType: 'event',
		eventCategory: 'button',
		eventAction: 'clicked Question Button',
		eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
	});
}

function setLatticePositionIndex(){

	var Q = parseFloat(d3.select('#latticePositionQ').node().value);
	var R = parseFloat(d3.select('#latticePositionR').node().value);
	var S = parseFloat(d3.select('#latticePositionS').node().value);
	
	params.scene.remove( params.scene.getObjectByName('ttPosition') ); //remove any Lattice Position 

	if (!isNaN(Q) && !isNaN(R) && !isNaN(S)){
		updateLatticePositionIndex(Q, R, S);

		//create point
		var p = new THREE.Vector3(Q, R, S);

		drawSphere(0.1, params.sphereSegments, params.sphereSegments, 1., 0x000000, p, true, 'ttPosition');

		var label = 'Lattice Position Index ' + Q + ' ' + R + ' ' + S;
		console.log(label);

		ga('send', { 
			hitType: 'event',
			eventCategory: 'button',
			eventAction: 'clicked Lattice Position Button',
			eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
		});
	} else {
		//remove any point

	}
}
function updateLatticePositionIndex(Q, R, S){
	d3.select('#latticePositionQ').node().value = Q;
	d3.select('#latticePositionR').node().value = R;
	d3.select('#latticePositionS').node().value = S;
}

function setLatticeDirectionIndex(){

	var U = parseFloat(d3.select('#latticeDirectionU').node().value);
	var V = parseFloat(d3.select('#latticeDirectionV').node().value);
	var W = parseFloat(d3.select('#latticeDirectionW').node().value);
	
	params.scene.remove( params.scene.getObjectByName('ttArrow') ); //remove any arrow 

	if (!isNaN(U) && !isNaN(V) && !isNaN(W)){
		updateLatticeDirectionIndex(U, V, W);

		//create arrow
		var p1 = new THREE.Vector3(0, 0, 0);
		if (params.ttMeshIndex.length  >= 1) p1 = params.spheres[params.ttMeshIndex[0]].position.clone();
		var direction = new THREE.Vector3(U, V, W);
		var p2 = direction.clone().add(p1);

		makeArrowFromPoints(p1, p2);

		var label = 'Lattice Direction Index ' + U + ' ' + V + ' ' + W;
		console.log(label);

		ga('send', { 
			hitType: 'event',
			eventCategory: 'button',
			eventAction: 'clicked Lattice Direction Button',
			eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
		});
	} 

}
function updateLatticeDirectionIndex(U, V, W){
	d3.select('#latticeDirectionU').node().value = U;
	d3.select('#latticeDirectionV').node().value = V;
	d3.select('#latticeDirectionW').node().value = W;
}


function setLatticePlaneIndex(){

	var H = parseFloat(d3.select('#latticePlaneH').node().value);
	var K = parseFloat(d3.select('#latticePlaneK').node().value);
	var L = parseFloat(d3.select('#latticePlaneL').node().value);
	
	params.scene.remove( params.scene.getObjectByName('ttPlane') ); //remove any plane 

	if (!isNaN(H) && !isNaN(K) && !isNaN(L)){

		updateLatticePlaneIndex(H, K, L);

		//in case they changed due to the factorization (which we may remove later on)
		H = parseFloat(d3.select('#latticePlaneH').node().value);
		K = parseFloat(d3.select('#latticePlaneK').node().value);
		L = parseFloat(d3.select('#latticePlaneL').node().value);

		//technically if any H,K,L value is zero, the corresponding point would have an infinite value
		//we can't have infinite values in the points so I will simply set them to very large values
		//there may be a better way to do this, but I think this will work well enough going in this direction
		var p1 = new THREE.Vector3(1e10, 0, 0);
		var p2 = new THREE.Vector3(0, 1e10, 0);
		var p3 = new THREE.Vector3(0, 0, 1e10);
		if (H != 0.) p1.x = 1./H;
		if (K != 0.) p2.y = 1./K;
		if (L != 0.) p3.z = 1./L;

		makePlaneFromPoints(p1, p2, p3);

		var label = 'Lattice Plane Index ' + H + ' ' + K + ' ' + L;
		console.log(label);

		ga('send', { 
			hitType: 'event',
			eventCategory: 'button',
			eventAction: 'clicked Lattice Plane Button',
			eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
		});
	} 

}
function getFactors(num){
//https://stackoverflow.com/questions/22130043/trying-to-find-factors-of-a-number-in-js

	const isEven = num % 2 === 0;
	let inc = isEven ? 1 : 2;
	let factors = [1, num];

	for (let curFactor = isEven ? 2 : 3; Math.pow(curFactor, 2) <= num; curFactor += inc) {
		if (num % curFactor !== 0) continue;
		factors.push(curFactor);
		let compliment = num / curFactor;
		if (compliment !== curFactor) factors.push(compliment);
	}

	return factors;
}
function makeHist(arr){
//https://stackoverflow.com/questions/5667888/counting-the-occurrences-frequency-of-array-elements	\

	var counts = {};
	for (var i = 0; i < arr.length; i++) {
		var num = arr[i];
		counts[num] = counts[num] ? counts[num] + 1 : 1;
	}

	return counts;
}
function chooseFactor(n1, n2, n3){
	var fac = 1;
	var num = 0;
	var factors1 = [];
	var factors2 = [];
	var factors3 = []
	if (n1 != 0) {
		factors1 = getFactors(Math.abs(n1));
		num ++
	}
	if (n2 != 0) {
		factors2 = getFactors(Math.abs(n2));
		num ++
	}
	if (n3 != 0) {
		factors3 = getFactors(Math.abs(n3));
		num ++
	}
	if (num > 0){
		var factors123 = factors1.concat(factors2).concat(factors3);
		var counts = makeHist(factors123);
		for (var i=0; i<factors123.length; i++){
			if (counts[factors123[i]] == num && counts[factors123[i]] > fac && Number.isInteger(counts[factors123[i]])){
				fac = factors123[i];
			}
		}
		console.log("factors",factors1, factors2, factors3, factors123, counts, fac);
	}
	return fac;
}
function updateLatticePlaneIndex(H, K, L){
	//reduce this to the smallest integer values, and update the input boxes
	//Jon says this is incorrect, but we will include it here to match the current textbook
	var fac = chooseFactor(H, K, L);
	if (fac > 1){
		H /= fac;
		K /= fac;
		L /= fac;
	}

	d3.select('#latticePlaneH').node().value = H;
	d3.select('#latticePlaneK').node().value = K;
	d3.select('#latticePlaneL').node().value = L;
}
function getLatticePlaneIndexFromPlane(plane){

	var bigPlane = plane.clone();
	bigPlane.scale = new THREE.Vector3(1000, 1000);


	//check intersection with x axis
	//try in one direction
	var xAxis = new THREE.Line3(new THREE.Vector3(-1000, 0, 0), new THREE.Vector3(1000, 0, 0));
	var yAxis = new THREE.Line3(new THREE.Vector3(0, -1000, 0), new THREE.Vector3(0, 1000, 0));
	var zAxis = new THREE.Line3(new THREE.Vector3(0, 0, -1000), new THREE.Vector3(0, 0, 1000));
	var xPoint = new THREE.Vector3();
	var yPoint = new THREE.Vector3();
	var zPoint = new THREE.Vector3();
	bigPlane.intersectLine(xAxis, xPoint);
	bigPlane.intersectLine(yAxis, yPoint);
	bigPlane.intersectLine(zAxis, zPoint);
	
	var origin = new THREE.Vector3(0,0,0);
	if (xPoint.equals(origin) || yPoint.equals(origin) || zPoint.equals(origin)){
		console.log('WARNING: origin selected, moving plane')
		bigPlane.translate(new THREE.Vector3(0,0,1)); //in case the origins is included
		bigPlane.intersectLine(xAxis, xPoint);
		bigPlane.intersectLine(yAxis, yPoint);
		bigPlane.intersectLine(zAxis, zPoint);
	}

	// //if necessary, try in the other direction
	// if (xPoint.x == 0 && xPoint.y == 0 & xPoint.z == 0){
	// 	console.log("trying negative x axis", xPoint)
	// 	xAxis = new THREE.Line3(new THREE.Vector3(0,0,0), new THREE.Vector3(-1000, 0, 0));
	// 	xPoint = new THREE.Vector3();
	// 	bigPlane.intersectLine(xAxis, xPoint);
	// }
	// if (yPoint.x == 0 && yPoint.y == 0 & yPoint.z == 0){
	// 	console.log("trying negative y axis", yPoint)
	// 	yAxis = new THREE.Line3(new THREE.Vector3(0,0,0), new THREE.Vector3(0, -1000, 0));
	// 	yPoint = new THREE.Vector3();
	// 	bigPlane.intersectLine(yAxis, yPoint);
	// }
	// if (zPoint.x == 0 && zPoint.y == 0 & zPoint.z == 0){
	// 	console.log("trying negative z axis", zPoint)
	// 	zAxis = new THREE.Line3(new THREE.Vector3(0,0,0), new THREE.Vector3(0, 0, -1000));
	// 	zPoint = new THREE.Vector3();
	// 	bigPlane.intersectLine(zAxis, zPoint);
	// }

	console.log("found points",xPoint, yPoint, zPoint);
	//is this correct??
	var fac = chooseFactor(xPoint.x, yPoint.y, zPoint.z);
	if (fac > 1){
		xPoint.x /= fac;
		yPoint.y /= fac;
		zPoint.z /= fac;
	}


	var H = 0;
	var K = 0;
	var L = 0;
	if (xPoint.x != 0) H = 1./xPoint.x;
	if (yPoint.y != 0) K = 1./yPoint.y;
	if (zPoint.z != 0) L = 1./zPoint.z;

	updateLatticePlaneIndex(H, K, L);

}
function setMirror(){
	var X = d3.select('#mirrorX').node().value;
	var Y = d3.select('#mirrorY').node().value;
	var Z = d3.select('#mirrorZ').node().value;
	var label = 'Mirror ' + X + ' ' + Y + ' ' + Z;
	console.log(label);

	ga('send', { 
		hitType: 'event',
		eventCategory: 'button',
		eventAction: 'clicked Mirror Button',
		eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
	});

	//remove all mirrored spheres
	var toRemove = [];
	params.scene.traverse(function(child) {
		if (child.name.includes("Mirror")) toRemove.push(child);
	});
	toRemove.forEach(function(child){
		params.scene.remove(child);
	})


	//add the mirrored spheres
	for (var i = 0; i<X; i++){
		for (var j = 0; j<Y; j++){
			for (var k = 0; k<Z; k++){	
				if (i > 0 || j > 0 || k> 0){
					params.spheres.forEach(function(m){
						var pos = m.position;
						var geo = m.geometry;
						var mat = m.material.clone(); //so that the colors of the mirrored objects don't change
						if (params.inDefaultView) mat.opacity = params.defaultOuterOpacity;
						mat.transparent.value = true;
						//m.color.setHex(params.sphereColor);
						var mm = new THREE.Mesh(geo,mat);
						if (mm.material.opacity.value < 1) mm.renderOrder = 1;
						//need an if statement so that I don't copy the ends?
						//var mm = m.clone();
						mm.name = m.name + "Mirror";
						mm.position.set(pos.x + i*params.size, pos.y + j*params.size, pos.z + k*params.size);
						params.scene.add(mm);
					})	
				}
			}
		}
	}

}

function checkTooltips(){
	params.showTooltips = !params.showTooltips;

	var label = 'Tooltips '

	d3.selectAll('.tooltip').classed('hidden', !params.showTooltips);

	d3.select('#tooltipButton').classed('buttonClickedControls', params.showTooltips)
	if (params.showTooltips){
		d3.select('#tooltipButton').text('Tooltips On');
		label += 'On';
	} else {
		d3.select('#tooltipButton').text('Tooltips Off');
		label += 'Off';
	}

	console.log(label);

	ga('send', { 
		hitType: 'event',
		eventCategory: 'button',
		eventAction: 'clicked Tooltips OnOff Button',
		eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
	});
}

function checkAtoms(flag, name, buttonID, swapFlag=true, calledFromSlice=false){
	if (swapFlag) params[flag] = !params[flag];

	//var label = name + ' '
	var label = d3.select('#'+buttonID).text().split(" ")[0];
	var labelName = label; //because I will add On or Off below but want to save the name for analytics

	var m = [];
	params.scene.traverse(function(child) {
		if (child.name.includes(name)) m.push(child);
	});
	m.forEach(function(child){
		child.material.visible = params[flag];
	});

	//special case for Atoms and anything other than default view
	if (name == "Atoms"){
		if (params.inDefaultView) {
			showHemiSpheres(params[flag]);
		} else {
			showHemiSpheres(false);
		}
	}
	
	//do I need a special case for slice view and interstitials?
	if (params.isSlice && !calledFromSlice){
		sliceView(doTween=false);
	}
	
	d3.select('#'+buttonID).classed('buttonClickedControls', params[flag]);
	if (params[flag]){
		d3.select('#'+buttonID).text(label + ' On');
		label += 'On';
	} else {
		d3.select('#'+buttonID).text(label + ' Off');
		label += 'Off';
	}

	console.log(label);

	ga('send', { 
		hitType: 'event',
		eventCategory: 'button',
		eventAction: 'clicked ' + labelName + ' OnOff Button',
		eventLabel: label + ' , ' + timeStamp() + ' , ' + params.userIP,
	});
}
