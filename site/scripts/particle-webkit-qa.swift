// macOS-only isolated WebKit test: no Safari profile, credentials, or physical inputs.
// swift site/scripts/particle-webkit-qa.swift [URL]
import AppKit
import WebKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let target = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "http://127.0.0.1:8793/"
let directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(".cache/webkit-particle-qa")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
// Exercise the 3x/coarse-pointer code path. This is desktop WebKit emulating
// phone inputs, not an assertion about a physical iPhone or its GPU driver.
config.userContentController.addUserScript(WKUserScript(source: """
Object.defineProperty(window,'devicePixelRatio',{get:()=>3});
const originalMatchMedia=window.matchMedia.bind(window);
window.matchMedia=query=>{const result=originalMatchMedia(query);if(query==='(pointer: coarse)')Object.defineProperty(result,'matches',{value:true});return result;};
""", injectionTime: .atDocumentStart, forMainFrameOnly: true))
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = view
// WebKit suspends animation when its view isn't in a visible window. Order
// this test window behind other apps without activating it or using Safari.
window.orderBack(nil)

func fail(_ message: String) -> Never { fputs("FAIL: \(message)\n", stderr); exit(1) }
let sample = """
const deadline=performance.now()+25000;
while(document.querySelector('[data-site-particles]')?.dataset.ready!=='true'){
 if(performance.now()>deadline)throw Error('Dune scene did not initialize');
 await new Promise(resolve=>setTimeout(resolve,50));
}
await new Promise(resolve=>setTimeout(resolve,300));
async function pixels(){return await new Promise(resolve=>requestAnimationFrame(()=>{
 const c=document.querySelector('[data-site-particles] canvas'),gl=c.getContext('webgl2');
 const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
 let invalid=0,lit=0,hash=2166136261;
 for(let i=0;i<p.length;i+=4){if(Math.max(p[i],p[i+1],p[i+2])>p[i+3]+2)invalid++;if(p[i+3]>4)lit++;if(i%64===0)hash=Math.imul(hash^p[i]^p[i+3],16777619)>>>0;}
 resolve({width:innerWidth,canvasWidth:c.width,canvasHeight:c.height,dpr:devicePixelRatio,coarse:matchMedia('(pointer: coarse)').matches,premultiplied:gl.getContextAttributes().premultipliedAlpha,error:gl.getError(),invalid,lit,hash});
}));}
const a=await pixels();await new Promise(resolve=>setTimeout(resolve,180));const b=await pixels();
if(a.error||a.invalid||!a.premultiplied||a.lit<100)throw Error('Invalid rendered frame: '+JSON.stringify(a));
if(a.canvasWidth!==a.width*3)throw Error('Retina canvas was downscaled: '+JSON.stringify(a));
if(a.hash===b.hash)throw Error('Particles stopped moving');
if(document.documentElement.scrollWidth>innerWidth)throw Error('Horizontal overflow');
return JSON.stringify(a);
"""

class ParticleCheck: NSObject, WKNavigationDelegate {
  var results: [[String: Any]] = []
  var stages = ["portrait", "scroll", "landscape"]
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { run(0) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
  func run(_ index: Int) {
    view.callAsyncJavaScript(sample, arguments: [:], in: nil, in: .page) { result in
      switch result {
      case .failure(let error): fail(String(describing: (error as NSError).userInfo))
      case .success(let value):
        guard let text = value as? String, let data = text.data(using: .utf8), var metrics = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { fail("Missing WebKit frame metrics") }
        metrics["stage"] = self.stages[index]
        view.takeSnapshot(with: nil) { image, error in
          guard error == nil, let image = image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { fail("WebKit snapshot failed") }
          // Check the FINAL composited page, not only the WebGL buffer. The
          // reported defect covered most of the page in saturated blue; normal
          // blue text/buttons occupy a small fraction of the snapshot.
          var blue = 0, total = 0
          for y in stride(from: 0, to: bitmap.pixelsHigh, by: 3) {
            for x in stride(from: 0, to: bitmap.pixelsWide, by: 3) {
              guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
              total += 1
              if color.blueComponent > 0.6 && color.blueComponent - color.redComponent > 0.25 && color.blueComponent - color.greenComponent > 0.15 { blue += 1 }
            }
          }
          let ratio = Double(blue) / Double(max(1,total))
          guard ratio < 0.12 else { fail("Opaque blue fill in WebKit snapshot: \(ratio)") }
          metrics["compositedBlueRatio"] = ratio
          try? png.write(to: directory.appendingPathComponent("\(self.stages[index]).png"))
          self.results.append(metrics)
          if index == 0 {
            view.evaluateJavaScript("document.querySelector('#film').scrollIntoView({block:'start',behavior:'instant'})") { _, error in
              if let error = error { fail(error.localizedDescription) }
              self.run(1)
            }
          } else if index == 1 {
            window.setContentSize(NSSize(width: 844, height: 390))
            view.evaluateJavaScript("window.scrollTo({top:0,behavior:'instant'})") { _, error in
              if let error = error { fail(error.localizedDescription) }
              DispatchQueue.main.asyncAfter(deadline: .now()+0.5) { self.run(2) }
            }
          } else {
            let report: [String: Any] = ["engine":"macOS WebKit", "phoneInputsEmulated":true, "physicalIPhone":false, "url":target, "results":self.results]
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted,.sortedKeys]) { try? data.write(to:directory.appendingPathComponent("results.json")) }
            print("PASS: WebKit 3x portrait, scrolling and landscape; animated particles, valid alpha, and no opaque blue fill in final page snapshots.")
            window.close(); app.terminate(nil)
          }
        }
      }
    }
  }
}
let check = ParticleCheck()
view.navigationDelegate = check
guard let url = URL(string: target) else { fail("Invalid test URL") }
view.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now()+90) { fail("WebKit particle test timed out") }
app.run()
