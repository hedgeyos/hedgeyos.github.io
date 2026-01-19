export function createHud({ video, body }){
  let stream = null;
  let enabled = false;

  async function enable(){
    if (enabled) return true;
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      await video.play();
      body.classList.add("hud-on");
      enabled = true;
      return true;
    } catch (err){
      console.warn("HUD camera error", err);
      return false;
    }
  }

  function disable(){
    if (!enabled) return;
    body.classList.remove("hud-on");
    enabled = false;
    if (stream){
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  async function toggle(){
    if (enabled) {
      disable();
      return;
    }
    await enable();
  }

  return { enable, disable, toggle };
}
