using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

// Temporary system cursor images, never registry settings. The separate watchdog owns
// the session mutex until recovery finishes, including after the lease process dies.
// Arrow geometry adapted from MIT wushi2333/dsh-computer-use_codex-style at
// 72f390ae076948968370510ea7f5b44dcf3e6015, overlay/mod.rs CURSOR_GLYPH_POINTS.
// See CursorLease.NOTICE.txt. Do not add a second, drawn pointer in the Electron overlay.
static class CursorLease {
  const string MutexName="Local\\DshComputerUseCursorLease.v1";
  static string testDirectory;
  static bool failApply;
  static readonly int[] CursorIds={32512,32513,32514,32515,32516,32642,32643,32644,32645,32646,32648,32649,32650,32651};
  static readonly float[,] Points={{.00599f,.15864f},{-.02364f,.06456f},{.06169f,-.02474f},{.15158f,.00627f},{.87634f,.25652f},{.97594f,.29096f},{.98340f,.43547f},{.88794f,.48095f},{.59343f,.62108f},{.45955f,.92925f},{.41611f,1.02925f},{.27801f,1.02146f},{.24510f,.91717f}};
  [StructLayout(LayoutKind.Sequential)] struct IconInfo { public bool icon; public uint x,y; public IntPtr mask,color; }
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr LoadCursor(IntPtr instance,IntPtr id);
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr CopyImage(IntPtr image,uint type,int width,int height,uint flags);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetSystemCursor(IntPtr cursor,uint id);
  [DllImport("user32.dll")] static extern bool DestroyCursor(IntPtr cursor);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
  [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon,out IconInfo info);
  [DllImport("user32.dll")] static extern IntPtr CreateIconIndirect(ref IconInfo info);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SystemParametersInfo(uint action,uint value,IntPtr data,uint flags);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint timeout);

  static void Log(string value) { if(testDirectory!=null)File.AppendAllText(Path.Combine(testDirectory,Process.GetCurrentProcess().Id+".log"),value+Environment.NewLine); }
  static void Reply(string value) { Console.WriteLine(value);Console.Out.Flush(); }
  static string Quote(string value) {
    var text=new StringBuilder("\"");int slashes=0;
    foreach(char c in value){if(c=='\\'){slashes++;continue;}text.Append('\\',c=='\"'?slashes*2+1:slashes);text.Append(c);slashes=0;}
    text.Append('\\',slashes*2);return text.Append('"').ToString();
  }
  static string SessionMutex() {
    if(testDirectory==null)return MutexName;
    using(var sha=SHA256.Create())return MutexName+".test."+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(testDirectory))).Replace("-","");
  }
  static bool ReloadConfiguredCursors() {
    if(testDirectory!=null){Log("reload-configured");return true;}
    for(int attempt=0;attempt<3;attempt++){if(SystemParametersInfo(0x57,0,IntPtr.Zero,0))return true;Thread.Sleep(80);}
    return false;
  }
  static Bitmap ArrowBitmap(int size) {
    var bitmap=new Bitmap(size,size,PixelFormat.Format32bppArgb);
    // Render the small native cursor at 4x, then filter once to its actual pixel size.
    using(var large=new Bitmap(size*4,size*4,PixelFormat.Format32bppPArgb)){
      using(var graphics=Graphics.FromImage(large))using(var path=new GraphicsPath())using(var ink=new SolidBrush(Color.FromArgb(255,8,8,8)))using(var edge=new Pen(Color.FromArgb(242,255,255,255),Math.Max(.9f,size/40f))){
        graphics.Clear(Color.Transparent);graphics.ScaleTransform(4,4);graphics.SmoothingMode=SmoothingMode.AntiAlias;graphics.PixelOffsetMode=PixelOffsetMode.HighQuality;
        float glyph=size*.76f,pad=size*.10f;var points=new PointF[Points.GetLength(0)];
        for(int i=0;i<points.Length;i++)points[i]=new PointF(pad+Points[i,0]*glyph,pad+Points[i,1]*glyph);
        path.AddBezier(points[0],points[1],points[2],points[3]);path.AddLine(points[3],points[4]);
        path.AddBezier(points[4],points[5],points[6],points[7]);
        var before=new PointF(points[8].X+(points[7].X-points[8].X)*.08f,points[8].Y+(points[7].Y-points[8].Y)*.08f);
        var after=new PointF(points[8].X+(points[9].X-points[8].X)*.08f,points[8].Y+(points[9].Y-points[8].Y)*.08f);
        path.AddLine(points[7],before);path.AddBezier(before,points[8],points[8],after);path.AddLine(after,points[9]);
        path.AddBezier(points[9],points[10],points[11],points[12]);path.AddLine(points[12],points[0]);path.CloseFigure();
        var saved=graphics.Save();graphics.TranslateTransform(0,size*.014f);
        using(var outer=new Pen(Color.FromArgb(12,0,0,0),edge.Width+size*.05f))using(var inner=new Pen(Color.FromArgb(22,0,0,0),edge.Width+size*.02f))using(var shadow=new SolidBrush(Color.FromArgb(24,0,0,0))){
          outer.LineJoin=LineJoin.Round;inner.LineJoin=LineJoin.Round;graphics.DrawPath(outer,path);graphics.DrawPath(inner,path);graphics.FillPath(shadow,path);
        }
        graphics.Restore(saved);edge.LineJoin=LineJoin.Round;graphics.FillPath(ink,path);graphics.DrawPath(edge,path);
      }
      using(var graphics=Graphics.FromImage(bitmap))using(var attributes=new ImageAttributes()){
        graphics.CompositingMode=CompositingMode.SourceCopy;graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;graphics.PixelOffsetMode=PixelOffsetMode.HighQuality;
        attributes.SetWrapMode(WrapMode.TileFlipXY);graphics.DrawImage(large,new Rectangle(0,0,size,size),0,0,large.Width,large.Height,GraphicsUnit.Pixel,attributes);
      }
    }
    return bitmap;
  }
  static IntPtr ArrowCursor(int size) {
    using(var bitmap=ArrowBitmap(size)){
      IntPtr icon=bitmap.GetHicon();IconInfo info;
      try{
        if(!GetIconInfo(icon,out info))throw new InvalidOperationException("cursor-icon-info");
        try{info.icon=false;info.x=(uint)Math.Round(size*.10);info.y=(uint)Math.Round(size*.10);IntPtr cursor=CreateIconIndirect(ref info);if(cursor==IntPtr.Zero)throw new InvalidOperationException("cursor-create");return cursor;}
        finally{if(info.mask!=IntPtr.Zero)DeleteObject(info.mask);if(info.color!=IntPtr.Zero)DeleteObject(info.color);}
      }finally{DestroyIcon(icon);}
    }
  }
  sealed class Images:IDisposable {
    readonly Dictionary<int,IntPtr> originals=new Dictionary<int,IntPtr>();
    IntPtr arrow;
    public void Capture(bool prepareArrow=true){
      Log("snapshot");if(testDirectory!=null)return;
      try{
        foreach(int id in CursorIds){IntPtr copy=CopyImage(LoadCursor(IntPtr.Zero,new IntPtr(id)),2,0,0,0);if(copy==IntPtr.Zero)throw new InvalidOperationException("cursor-backup");originals.Add(id,copy);}
        if(prepareArrow)arrow=ArrowCursor(Math.Max(32,Math.Min(128,GetSystemMetrics(13))));
      }catch{Dispose();throw;}
    }
    public void Apply(){
      Log("apply");if(testDirectory!=null){if(failApply)throw new InvalidOperationException("test-apply-failure");return;}
      foreach(int id in CursorIds){IntPtr copy=CopyImage(arrow,2,0,0,0);if(copy==IntPtr.Zero)throw new InvalidOperationException("cursor-copy");if(!SetSystemCursor(copy,(uint)id)){DestroyCursor(copy);throw new InvalidOperationException("cursor-replace");}}
    }
    public bool Restore(){
      Log("restore-original");if(testDirectory!=null)return true;
      bool ok=true;
      foreach(var entry in originals){IntPtr copy=CopyImage(entry.Value,2,0,0,0);if(copy==IntPtr.Zero){ok=false;continue;}if(!SetSystemCursor(copy,(uint)entry.Key)){DestroyCursor(copy);ok=false;}}
      return ok||ReloadConfiguredCursors();
    }
    public void Dispose(){foreach(var image in originals.Values)DestroyCursor(image);originals.Clear();if(arrow!=IntPtr.Zero){DestroyCursor(arrow);arrow=IntPtr.Zero;}}
  }
  sealed class Signals:IDisposable {
    public readonly string Prefix;
    public readonly EventWaitHandle Ready,Arm,Armed,Disarm,Disarmed,Quit;
    public Signals(string prefix,bool create){
      Prefix=prefix;
      Ready=Open("ready",create,true);Arm=Open("arm",create,false);Armed=Open("armed",create,false);
      Disarm=Open("disarm",create,false);Disarmed=Open("disarmed",create,false);Quit=Open("quit",create,false);
    }
    EventWaitHandle Open(string suffix,bool create,bool manual){string name=Prefix+"."+suffix;return create?new EventWaitHandle(false,manual?EventResetMode.ManualReset:EventResetMode.AutoReset,name):EventWaitHandle.OpenExisting(name);}
    public void Dispose(){Ready.Dispose();Arm.Dispose();Armed.Dispose();Disarm.Dispose();Disarmed.Dispose();Quit.Dispose();}
  }
  static int Watchdog(int parentId,string prefix){
    bool ownsMutex=false,armed=false;Images recovery=null;
    using(var mutex=new Mutex(false,SessionMutex()))using(var parent=Process.GetProcessById(parentId))using(var signal=new Signals(prefix,false)){
      try{
        try{ownsMutex=mutex.WaitOne(0);}catch(AbandonedMutexException){ownsMutex=true;}
        if(!ownsMutex){Log("watchdog-busy");return 4;}
        IntPtr parentHandle=parent.Handle;if(parent.HasExited)return 5;
        var waits=new[]{parentHandle,signal.Arm.SafeWaitHandle.DangerousGetHandle(),signal.Disarm.SafeWaitHandle.DangerousGetHandle(),signal.Quit.SafeWaitHandle.DangerousGetHandle()};
        Log("watchdog-ready");signal.Ready.Set();
        while(true){
          uint wait=WaitForMultipleObjects((uint)waits.Length,waits,false,0xffffffff);
          if(wait==1){if(!armed){recovery=new Images();recovery.Capture(false);armed=true;}Log("watchdog-armed");signal.Armed.Set();}
          else if(wait==2){armed=false;if(recovery!=null){recovery.Dispose();recovery=null;}Log("watchdog-disarmed");signal.Disarmed.Set();}
          else break;
        }
        return 0;
      }finally{
        if(armed&&(recovery==null||!recovery.Restore())&&!ReloadConfiguredCursors())Console.Error.WriteLine("Cursor recovery failed; reload the Windows pointer scheme.");
        if(recovery!=null)recovery.Dispose();
        Log("watchdog-exit");if(ownsMutex)mutex.ReleaseMutex();
      }
    }
  }
  static void WaitAck(EventWaitHandle ack,ManualResetEvent died){if(WaitHandle.WaitAny(new WaitHandle[]{ack,died},3000)!=0)throw new InvalidOperationException("cursor-watchdog-unavailable");}
  static int Run(){
    // Retain ownership while the main process restores after a watchdog failure.
    // Conversely the watchdog mutex covers recovery after this owner is killed.
    using(var owner=new Mutex(false,SessionMutex()+".owner")){
      bool held=false;
      try{
        try{held=owner.WaitOne(0);}catch(AbandonedMutexException){held=true;}
        if(!held){Log("lease-busy");Console.Error.WriteLine("cursor-lease-busy");Reply("failure");return 2;}
        return RunOwned();
      }finally{if(held)owner.ReleaseMutex();}
    }
  }
  static int RunOwned(){
    bool armed=false;Images images=null;Process watchdog=null;
    var input=new BlockingCollection<string>();
    using(var died=new ManualResetEvent(false))using(var signal=new Signals("Local\\DshCursorLease."+Guid.NewGuid().ToString("N"),true)){
      Action restore=()=>{
        if(!armed)return;
        if(images==null||!images.Restore())throw new InvalidOperationException("cursor-restore");
        images.Dispose();images=null;armed=false;
        if(!died.WaitOne(0)){signal.Disarm.Set();WaitAck(signal.Disarmed,died);}
      };
      try{
        string arguments="--watchdog "+Process.GetCurrentProcess().Id+" "+Quote(signal.Prefix)+(testDirectory==null?"":" --test-double "+Quote(testDirectory));
        watchdog=new Process{StartInfo=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,arguments){UseShellExecute=false,CreateNoWindow=true},EnableRaisingEvents=true};
        watchdog.Exited+=(sender,eventArgs)=>{try{died.Set();}catch(ObjectDisposedException){}};watchdog.Start();
        if(WaitHandle.WaitAny(new WaitHandle[]{signal.Ready,died},5000)!=0)throw new InvalidOperationException("cursor-watchdog-start");
        Log("ready");Reply("ready");
        new Thread(()=>{try{string line;while((line=Console.ReadLine())!=null)input.Add(line);}finally{input.Add("__eof");}}){IsBackground=true}.Start();
        while(true){
          if(died.WaitOne(0))throw new InvalidOperationException("cursor-watchdog-exit");
          string command;if(!input.TryTake(out command,100))continue;
          if(command=="__eof")break;
          if(command=="enable"){
            if(!armed){
              images=new Images();images.Capture();signal.Arm.Set();WaitAck(signal.Armed,died);armed=true;
              // The watchdog owns recovery before the first global image is changed.
              if(died.WaitOne(0))throw new InvalidOperationException("cursor-watchdog-exit");
              images.Apply();
            }
            Log("enabled");Reply("enabled");
          }else if(command=="disable"){
            restore();Log("disabled");Reply("disabled");
          }else if(command.Length>0)throw new InvalidOperationException("cursor-command");
        }
        restore();return 0;
      }catch(Exception error){Console.Error.WriteLine(error is InvalidOperationException?error.Message:"cursor-lease-failed");Reply("failure");return 2;}
      finally{
        try{restore();}catch{Console.Error.WriteLine("cursor-final-restore-failed");}
        if(images!=null)images.Dispose();
        if(watchdog!=null){signal.Quit.Set();try{watchdog.WaitForExit(1500);}catch{}watchdog.Dispose();}
        Log("lease-exit");
      }
    }
  }
  static int SelfTest(){
    using(var images=new Images())images.Capture();
    foreach(int size in new[]{32,48,64}){IntPtr cursor=ArrowCursor(size);try{IconInfo info;if(!GetIconInfo(cursor,out info))return 1;try{if(info.icon||info.x>=size||info.y>=size)return 1;}finally{DeleteObject(info.mask);DeleteObject(info.color);}}finally{DestroyCursor(cursor);}}
    Reply("native cursor construction and original-image copies: passed; no system cursors changed");return 0;
  }
  static void HashBitmap(BinaryWriter writer,IntPtr image){
    if(image==IntPtr.Zero){writer.Write(0);return;}
    using(var bitmap=Image.FromHbitmap(image)){
      writer.Write(bitmap.Width);writer.Write(bitmap.Height);
      var data=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
      try{
        var row=new byte[bitmap.Width*4];
        for(int y=0;y<bitmap.Height;y++){Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),row,0,row.Length);writer.Write(row);}
      }finally{bitmap.UnlockBits(data);}
    }
  }
  static int Fingerprint(){
    var records=new List<string>();var fingerprints=new StringBuilder();
    foreach(int id in CursorIds){
      IntPtr cursor=CopyImage(LoadCursor(IntPtr.Zero,new IntPtr(id)),2,0,0,0);IconInfo info;
      if(cursor==IntPtr.Zero)throw new InvalidOperationException("cursor-fingerprint-copy");
      try{
        if(!GetIconInfo(cursor,out info))throw new InvalidOperationException("cursor-fingerprint-info");
        try{
          using(var memory=new MemoryStream())using(var writer=new BinaryWriter(memory))using(var sha=SHA256.Create()){
            writer.Write(info.icon);writer.Write(info.x);writer.Write(info.y);HashBitmap(writer,info.color);HashBitmap(writer,info.mask);writer.Flush();
            string hash=BitConverter.ToString(sha.ComputeHash(memory.ToArray())).Replace("-","").ToLowerInvariant();fingerprints.Append(id).Append(':').Append(hash).Append(';');
            records.Add("{\"id\":"+id+",\"hotspotX\":"+info.x+",\"hotspotY\":"+info.y+",\"sha256\":\""+hash+"\"}");
          }
        }finally{if(info.mask!=IntPtr.Zero)DeleteObject(info.mask);if(info.color!=IntPtr.Zero)DeleteObject(info.color);}
      }finally{DestroyCursor(cursor);}
    }
    using(var sha=SHA256.Create())Reply("{\"count\":"+records.Count+",\"sha256\":\""+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(fingerprints.ToString()))).Replace("-","").ToLowerInvariant()+"\",\"cursors\":["+String.Join(",",records)+"]}");
    return 0;
  }
  [STAThread] static int Main(string[] args){
    try{
      try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch(EntryPointNotFoundException){}
      for(int i=0;i<args.Length;i++)if(args[i]=="--test-double"&&i+1<args.Length)testDirectory=Path.GetFullPath(args[++i]);else if(args[i]=="--test-fail-apply")failApply=true;
      if(failApply&&testDirectory==null)throw new InvalidOperationException("test-double-required");
      if(args.Length>0&&args[0]=="--self-test")return SelfTest();
      if(args.Length==1&&args[0]=="--fingerprint")return Fingerprint();
      if(args.Length==2&&args[0]=="--render-preview"){using(var bitmap=ArrowBitmap(96))bitmap.Save(args[1],ImageFormat.Png);return 0;}
      if(args.Length>=3&&args[0]=="--watchdog")return Watchdog(int.Parse(args[1]),args[2]);
      return Run();
    }catch{Console.Error.WriteLine("cursor-helper-failed");return 2;}
  }
}
