const dishes = [
  {name:"Palov",desc:"An’anaviy o‘zbek palovi",price:45000,img:"https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=700&q=85"},
  {name:"Manti",desc:"Go‘shtli va sabzavotli manti",price:35000,img:"https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=700&q=85"},
  {name:"Sho‘rva",desc:"Issiq va mazali sho‘rva",price:28000,img:"https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=85"},
  {name:"Lag‘mon",desc:"Qaynoq lag‘mon",price:32000,img:"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=700&q=85"},
  {name:"Salat",desc:"Yangi sabzavotlar salati",price:18000,img:"https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=85"}
];
const money = n => new Intl.NumberFormat("uz-UZ").format(n) + " so‘m";
const menuGrid = document.querySelector("#menuGrid");
const dishSelect = document.querySelector("#dishSelect");
dishes.forEach(dish => {
  const card=document.createElement("article");
  card.className="dish-card";
  const img=document.createElement("img"); img.src=dish.img; img.alt=dish.name; img.loading="lazy";
  const info=document.createElement("div"); info.className="dish-info";
  const title=document.createElement("h3"); title.textContent=dish.name;
  const desc=document.createElement("p"); desc.textContent=dish.desc;
  const price=document.createElement("div"); price.className="price"; price.textContent=money(dish.price);
  info.append(title,desc,price); card.append(img,info); menuGrid.append(card);
  const option=document.createElement("option"); option.value=dish.name; option.textContent=`${dish.name} — ${money(dish.price)}`; dishSelect.append(option);
});
const burger=document.querySelector("#burger");
const mobileMenu=document.querySelector("#mobileMenu");
burger.addEventListener("click",()=>{const open=mobileMenu.classList.toggle("open");burger.setAttribute("aria-expanded",String(open));});
mobileMenu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{mobileMenu.classList.remove("open");burger.setAttribute("aria-expanded","false");}));
const cursor=document.querySelector("#cursor");
window.addEventListener("mousemove",e=>{cursor.style.left=e.clientX+"px";cursor.style.top=e.clientY+"px";});
async function sendForm(form,endpoint,status){
  const button=form.querySelector("button[type=submit]"); const old=button.textContent;
  button.disabled=true;button.textContent="Yuborilmoqda…";status.textContent="";
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Xatolik yuz berdi");
    status.textContent="So‘rovingiz yuborildi. Tez orada siz bilan bog‘lanamiz.";form.reset();
  }catch(error){status.textContent=error.message==="Failed to fetch"?"Server ishga tushmagan. Keyinroq urinib ko‘ring.":error.message;}
  finally{button.disabled=false;button.textContent=old;}
}
document.querySelector("#reserveForm").addEventListener("submit",e=>{e.preventDefault();sendForm(e.currentTarget,"/api/reserve",document.querySelector("#reserveStatus"));});
document.querySelector("#orderForm").addEventListener("submit",e=>{e.preventDefault();sendForm(e.currentTarget,"/api/order",document.querySelector("#orderStatus"));});
