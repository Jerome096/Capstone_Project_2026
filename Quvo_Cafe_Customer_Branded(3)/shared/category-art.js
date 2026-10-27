// Category-specific fallback illustrations. Uploaded menu photos take priority.
(() => {
  let sequence=0;
  const plate='<ellipse cx="200" cy="215" rx="135" ry="43" fill="#dedccc"/><ellipse cx="200" cy="205" rx="136" ry="43" fill="url(#ART-cream)" stroke="#d7d1bd" stroke-width="2"/><ellipse cx="200" cy="204" rx="113" ry="31" fill="#eae6d6" stroke="#e0dbc8"/>';
  const drawings={
    frappe:`<path d="m143 77 13 161q1 15 16 15h57q15 0 16-15l13-161Z" fill="url(#ART-tea)" stroke="#ae946f" stroke-width="2"/>
      <path d="m148 109 10 126q1 13 15 13h55q13 0 14-13l10-126Z" fill="#d6b993"/>
      <path d="M151 154q32-19 53 1t45-3l-5 79q-1 15-15 15h-56q-14 0-15-15Z" fill="#c5a27a"/>
      <g fill="#fff7e9" opacity=".62"><rect x="159" y="100" width="26" height="22" rx="5" transform="rotate(-13 172 111)"/><rect x="199" y="113" width="28" height="22" rx="5" transform="rotate(15 213 124)"/><rect x="219" y="88" width="25" height="21" rx="4"/></g>
      <ellipse cx="200" cy="77" rx="59" ry="10" fill="#eee5d1" stroke="#aa987b" stroke-width="2"/><ellipse cx="200" cy="76" rx="51" ry="5" fill="#b18a5f"/>
      <path d="M148 76C144 66 155 58 169 58C164 46 175 38 188 37C184 27 193 22 209 16C205 28 211 35 223 39C237 40 242 49 236 58C251 59 259 67 253 77Q201 89 148 76Z" fill="url(#ART-cream)" stroke="#d4c9b1" stroke-width="1.7"/>
      <g fill="none" stroke="#dfd4bc" stroke-width="2" stroke-linecap="round"><path d="M170 58q31 11 65 0M188 37q10 8 34 3M155 73q43 11 89 1"/></g>
      <path d="m156 98 8 121" stroke="#fffcf0" stroke-width="5" opacity=".45" stroke-linecap="round"/>
      <path d="M170 174h59" stroke="#f5ead3" stroke-width="20" stroke-linecap="round" opacity=".8"/><path d="M182 174h35" stroke="#aa8755" stroke-width="2"/>`,
    tea:`<ellipse cx="196" cy="233" rx="112" ry="23" fill="#dedacc"/><ellipse cx="196" cy="228" rx="109" ry="21" fill="url(#ART-cream)" stroke="#d7d0bd"/>
      <path d="M259 116h17c48 0 47 65 0 66h-18" fill="none" stroke="#d5cbb6" stroke-width="19"/><path d="M258 116h17c42 0 41 61 0 62h-17" fill="none" stroke="#faf6e9" stroke-width="12"/>
      <path d="M122 103h143l-5 84q-3 37-67 37t-66-37Z" fill="url(#ART-cream)" stroke="#cfc5b0" stroke-width="2"/>
      <ellipse cx="193" cy="104" rx="71" ry="23" fill="#fff9e9" stroke="#d7cbb3" stroke-width="2"/><ellipse cx="193" cy="105" rx="60" ry="16" fill="#bd8546"/><ellipse cx="193" cy="104" rx="52" ry="12" fill="#d9ac67"/>
      <path d="m181 100 2 11 20 2 7-13Z" fill="#e5d8b5" stroke="#b6a274"/>
      <path d="M196 103q21-27 44-7t-2 61l2 14" fill="none" stroke="#f7f1df" stroke-width="2.5"/>
      <path d="m225 164 31-1 2 34-32 1Z" fill="#83966a" stroke="#5f7653" stroke-width="1.5"/><path d="m234 180 6-5 9 9-9 5Z" fill="#f4f1d7"/>
      <path d="M157 70c-16-15 14-22 0-38m37 35c-16-15 14-22 0-38m36 41c-16-15 14-22 0-38" fill="none" stroke="#b9b19a" stroke-width="2" stroke-linecap="round"/>`,
    pasta:plate+`<ellipse cx="197" cy="188" rx="96" ry="35" fill="#d9c79c"/><ellipse cx="197" cy="184" rx="91" ry="32" fill="#f5ead0"/>
      <g fill="none" stroke="#d9bb79" stroke-width="9" stroke-linecap="round"><path d="M125 191c-29-23 59-42 70-15s-71 10-34-12 87-4 74 18-85 24-69 5 93-17 95 5"/><path d="M133 176c34-35 114-16 95 6s-106 23-81 0 87-10 99 11"/><path d="M123 194c31-22 111 17 116-8s-88-36-88-4 91 34 115 14"/><path d="M156 160c-36 6 1 31 29 29s69-39 62-11-62 38-92 21"/></g>
      <g fill="none" stroke="#fff1cb" stroke-width="6" stroke-linecap="round"><path d="M125 190c-29-23 59-42 70-15s-71 10-34-12 87-4 74 18-85 24-69 5 93-17 95 5"/><path d="M133 175c34-35 114-16 95 6s-106 23-81 0 87-10 99 11"/><path d="M123 193c31-22 111 17 116-8s-88-36-88-4 91 34 115 14"/><path d="M156 159c-36 6 1 31 29 29s69-39 62-11-62 38-92 21"/></g>
      <g fill="#ad7059" stroke="#8c5b45" stroke-width="1"><path d="m141 176 14-4 5 8-15 5Z"/><path d="m211 160 15 2-2 9-16-3Z"/><path d="m185 191 15-3 4 8-17 4Z"/><path d="m236 187 13-2 3 8-13 3Z"/><path d="m161 201 12-3 4 7-14 4Z"/></g>
      <g stroke="#d8a18a" stroke-width="2"><path d="m144 178 10-3m58-12 10 2m-35 29 11-2m39-2 10-2"/></g>
      <g fill="#5c5140"><circle cx="169" cy="172" r="1.4"/><circle cx="204" cy="184" r="1.3"/><circle cx="226" cy="177" r="1.5"/><circle cx="146" cy="192" r="1.4"/><circle cx="215" cy="204" r="1.3"/><circle cx="184" cy="181" r="1.2"/><circle cx="252" cy="199" r="1.3"/></g>
      <g stroke="#fffdf0" stroke-width="3" stroke-linecap="round"><path d="m163 177 5 2m18 12 5-1m38-3 5 2m-29-17 4-1m-58 20 5 1m67 7 5-2m-43-31 5 1m-24 30 4-1"/></g>
      <g fill="#758a56"><path d="M188 160q-16-13-21-2 9 9 21 2Z"/><path d="M188 160q6-18 17-8-3 11-17 8Z"/></g>`,
    appetizer:plate+`<path d="M111 158q18-21 63-12l32 50q-27 22-78 10Z" fill="#f2e7cf" stroke="#d8c5a0"/>
      <g fill="url(#ART-gold)" stroke="#bf8a3d" stroke-width="1.5"><path d="m121 123 11-4 29 73-12 4Z"/><path d="m145 109 11-1 9 83-12 2Z"/><path d="m169 113 11 3-19 80-11-3Z"/><path d="m187 126 10 5-35 70-10-5Z"/><path d="m110 143 9-7 48 59-10 7Z"/><path d="m137 121 10-3 22 77-11 3Z"/></g>
      <g fill="url(#ART-gold)" stroke="#b48642" stroke-width="1.5" transform="rotate(-17 245 143)"><rect x="208" y="121" width="71" height="18" rx="7"/><rect x="214" y="143" width="75" height="18" rx="7"/><path d="m222 125 6 10m13-10 6 10m-17 12 6 10m13-10 6 10" stroke="#c19148" stroke-width="2"/></g>
      <g fill="none" stroke="#bc8b43" stroke-width="15"><ellipse cx="218" cy="172" rx="24" ry="19" transform="rotate(-12 218 172)"/><ellipse cx="248" cy="183" rx="23" ry="18" transform="rotate(20 248 183)"/></g>
      <g fill="none" stroke="#e8bc68" stroke-width="9"><ellipse cx="218" cy="170" rx="24" ry="19" transform="rotate(-12 218 170)"/><ellipse cx="248" cy="181" rx="23" ry="18" transform="rotate(20 248 181)"/></g>
      <g fill="url(#ART-gold)" stroke="#bb8a42" stroke-width="2"><path d="M104 205q-7-13 9-19t28 9q8 13-8 22t-29-12Z"/><path d="M144 213q0-17 19-16t25 15q0 17-21 18t-23-17Z"/><path d="M195 208q8-16 25-9t15 20q-7 16-25 10t-15-21Z"/></g>
      <g fill="#bf914a"><circle cx="115" cy="202" r="2"/><circle cx="131" cy="201" r="1.5"/><circle cx="160" cy="213" r="2"/><circle cx="175" cy="218" r="1.5"/><circle cx="211" cy="213" r="2"/><circle cx="222" cy="218" r="1.5"/></g>
      <path d="M258 201h53l-6 26q-21 15-42 0Z" fill="#fffaf0" stroke="#d8ccb5" stroke-width="1.5"/><ellipse cx="284" cy="201" rx="27" ry="11" fill="#fffaf0" stroke="#d8ccb5"/><ellipse cx="284" cy="202" rx="21" ry="7" fill="#ac4936"/><path d="M275 199q9-4 17 1" fill="none" stroke="#d27353" stroke-width="2"/>`,
    sandwiches:plate+`<path d="m110 194 60 34 134-38-1 19-131 39-62-37Z" fill="#bc8643" stroke="#a37136" stroke-width="2"/><path d="m112 194 59 32 130-37-1 10-128 39-60-35Z" fill="#f0d59b"/>
      <path d="m109 183 61 34 134-38-1 12-131 39-63-35Z" fill="#bb7a68"/><path d="m112 179 59 33 130-37-1 10-129 39-59-34Z" fill="#e9b951"/>
      <path d="m108 168 62 35 134-38-1 14-131 39-63-35Z" fill="#bd5f45"/>
      <path d="M107 161q9-9 18 3t18 3 19 9 18-1l104-29q15-4 23 5l-3 17q-9 9-20 4t-20 10-21 1-23 10-24 0-22 8-20-6-21-3-20-10-21-10Z" fill="#7c9552" stroke="#648044" stroke-width="1.5"/>
      <path d="m110 134 61 42 131-39-1 18-129 42-62-42Z" fill="#bd8542" stroke="#9f6c34" stroke-width="2"/>
      <path d="M111 134q-9-7 4-14l115-28q10-3 20 4l52 39q9 7-2 13l-122 37q-10 3-20-4Z" fill="#d4a45a" stroke="#a77539" stroke-width="2.5"/>
      <path d="M120 132q-5-4 3-8l108-26q7-2 14 3l49 36q5 4-2 7l-115 34q-7 2-13-2Z" fill="#f1d69b"/>
      <g fill="#d6b16e"><circle cx="153" cy="134" r="2"/><circle cx="178" cy="148" r="2"/><circle cx="215" cy="125" r="2"/><circle cx="250" cy="141" r="2"/><circle cx="205" cy="155" r="1.5"/><circle cx="175" cy="121" r="1.5"/></g>`,
    pizza:plate+`<ellipse cx="200" cy="172" rx="111" ry="65" fill="#b9803d"/><ellipse cx="200" cy="165" rx="111" ry="65" fill="url(#ART-gold)" stroke="#b47c36" stroke-width="2"/><ellipse cx="200" cy="165" rx="96" ry="53" fill="#b95f38"/><ellipse cx="200" cy="165" rx="90" ry="47" fill="#efd18a"/>
      <g fill="#b85d48" stroke="#a9533c" stroke-width="1.5"><ellipse cx="153" cy="142" rx="16" ry="10"/><ellipse cx="211" cy="129" rx="16" ry="10"/><ellipse cx="253" cy="158" rx="16" ry="10"/><ellipse cx="177" cy="177" rx="16" ry="10"/><ellipse cx="219" cy="197" rx="16" ry="9"/><ellipse cx="132" cy="174" rx="13" ry="9"/></g>
      <g fill="#dc8b65"><circle cx="150" cy="141" r="2"/><circle cx="157" cy="146" r="2"/><circle cx="209" cy="127" r="2"/><circle cx="255" cy="159" r="2"/><circle cx="176" cy="177" r="2"/><circle cx="218" cy="197" r="2"/></g>
      <g fill="#71854c"><path d="M181 142q-15-15-22-2 9 9 22 2Z"/><path d="M222 167q4-20 17-12-2 12-17 12Z"/><path d="M163 193q-12-11-19-1 10 9 19 1Z"/><path d="M245 183q14-12 18 1-10 7-18-1Z"/></g>
      <g stroke="#b18a4b" stroke-width="2" opacity=".7"><path d="m200 165 75 47M200 165l-25 64"/></g><path d="M202 166q15 15 30 21" stroke="#fff1bc" stroke-width="3" fill="none"/>`
  };
  function render(category){
    const drawing=Object.hasOwn(drawings,category)?drawings[category]:'';if(!drawing)return '';
    const id='category-art-'+(++sequence);
    return ('<svg class="category-menu-art" data-category-art="'+category+'" viewBox="0 0 400 300" aria-hidden="true" focusable="false"><defs><linearGradient id="ART-cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf5"/><stop offset="1" stop-color="#e9e3d3"/></linearGradient><linearGradient id="ART-gold" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#f2cf7c"/><stop offset="1" stop-color="#d6a34d"/></linearGradient><linearGradient id="ART-tea" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e1c9a6"/><stop offset="1" stop-color="#b69065"/></linearGradient><filter id="ART-shadow" x="-.5" y="-1" width="2" height="3"><feGaussianBlur stdDeviation="6"/></filter></defs><ellipse cx="200" cy="253" rx="105" ry="11" fill="#584a3025" filter="url(#ART-shadow)"/>'+drawing+'</svg>').replaceAll('ART-',id+'-');
  }
  window.QuvoCategoryArt={render};
})();
