(() => {
  const scenes = [
    {title:['Quiet heights','shape perspective.']},
    {title:['Quiet light','guides the night.']},
    {title:['Gentle movement,','lasting change.']},
    {title:['Slow curves','shape the land.']},
    {title:['Light wings,','clear direction.']},
    {title:['Small waves','make big change.']}
  ];
  const ns='http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current=-1;
  let drawingAnimations=[];
  function animateScene(drawing,index){
    const artwork=document.createElementNS(ns,'g');
    const outline=document.createElementNS(ns,'path');
    outline.setAttribute('d',window.portfolioOutlines[index]);
    outline.setAttribute('fill','currentColor');outline.setAttribute('stroke','none');
    outline.setAttribute('fill-rule','evenodd');
    artwork.append(outline);
    artwork.setAttribute('clip-path','url(#artwork-region)');
    drawing.append(artwork);
    if(reduced.matches)return;
    const mask=document.createElementNS(ns,'mask');
    mask.id='reference-reveal';mask.setAttribute('maskUnits','userSpaceOnUse');
    mask.setAttribute('x','0');mask.setAttribute('y','0');
    mask.setAttribute('width','1536');mask.setAttribute('height','1024');
    drawing.append(mask);artwork.setAttribute('mask','url(#reference-reveal)');
    // Disjoint regions preserve intersections; overlapping fades create a continuous drawing front.
    const feather=document.createElementNS(ns,'filter');
    feather.id='reveal-feather';feather.setAttribute('x','-1%');feather.setAttribute('y','-1%');
    feather.setAttribute('width','102%');feather.setAttribute('height','102%');
    const blur=document.createElementNS(ns,'feGaussianBlur');blur.setAttribute('stdDeviation','.55');
    feather.append(blur);drawing.append(feather);
    const revealGroup=document.createElementNS(ns,'g');
    revealGroup.setAttribute('filter','url(#reveal-feather)');mask.append(revealGroup);
    const pieces=window.portfolioReveals[index].map(({d,start})=>{
      const piece=document.createElementNS(ns,'path');
      piece.setAttribute('d',d);piece.setAttribute('fill','white');
      piece.setAttribute('stroke','none');
      piece.style.opacity='0';revealGroup.append(piece);return {piece,start};
    });
    const begin=()=>{
      if(!artwork.isConnected)return;
      drawingAnimations=pieces.map(({piece,start})=>piece.animate(
        [{opacity:0},{opacity:1}],{duration:96,delay:start,easing:'linear',fill:'forwards'}
      ));
      // Use the drawing duration and one clock for both strokes and title lines.
      const duration = Math.max(...pieces.map(({start}) => start)) + 96;
      const travel = Math.min(110, window.innerWidth * .12);
      const titleAnimations = [...document.querySelectorAll('#headline span')].map((line, i) => line.animate(
        [{transform:`translate3d(${-travel}px,0,0)`,opacity:0}, {transform:'translate3d(0,0,0)',opacity:1}],
        {duration:duration * (i ? .75 : .65),delay:duration * (i ? .25 : 0),easing:'cubic-bezier(.2,0,0,1)',fill:'both'}
      ));
      drawingAnimations.push(...titleAnimations);
      const startTime = document.timeline.currentTime;
      if (startTime !== null) drawingAnimations.forEach(animation => { animation.startTime = startTime; });
      Promise.all(drawingAnimations.map(a=>a.finished)).then(()=>{
        if(!artwork.isConnected)return;
        artwork.removeAttribute('mask');mask.remove();feather.remove();
        titleAnimations.forEach(animation => animation.cancel());
      }).catch(()=>{});
    };
    begin();
  }
  function render(index){
    drawingAnimations.forEach(animation=>animation.cancel());
    drawingAnimations=[];
    current=index;
    const scene=scenes[index];
    document.querySelector('#artwork-region path').setAttribute('d',`M0 ${index===2?545:534} H${index===3?650:index===5?700:750} V150 H1536 V812 H0 Z`);
    document.querySelector('#headline').replaceChildren(...scene.title.map(line => { const span = document.createElement('span'); span.textContent = line; return span; }));
    document.querySelector('#counter').textContent=`${String(index+1).padStart(2,'0')} / 06`;
    const drawing=document.querySelector('#drawing');drawing.replaceChildren();
    animateScene(drawing,index);
    document.querySelector('#replay-dunes').hidden=false;
    try{sessionStorage.setItem('portfolio-scene',String(index));}catch{}
    document.body.dataset.scene=String(index+1);
  }
  reduced.addEventListener('change', () => render(current));
  render(5);
  document.querySelector('#next-scene').hidden = true;
  document.querySelector('#replay-dunes').addEventListener('click',()=>render((current + 1) % scenes.length));
})();
