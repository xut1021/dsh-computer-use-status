using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// Observe only the human's Escape while a desktop task is active.
// Other keys are never retained or emitted. Injected Escape belongs to the target app.
static class EscapeGuard {
  delegate IntPtr Hook(int code,IntPtr message,IntPtr data);
  static Hook callback=OnKey;
  static IntPtr hook;
  static volatile bool enabled;
  static bool down;
  static ApplicationContext context;
  [StructLayout(LayoutKind.Sequential)] struct Key {public uint vk,scan,flags,time;public UIntPtr extra;}
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,Hook callback,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
  internal static bool HumanEscape(uint vk,uint flags){return vk==27&&(flags&0x12)==0;}
  static IntPtr OnKey(int code,IntPtr message,IntPtr data){
    if(code>=0){var k=(Key)Marshal.PtrToStructure(data,typeof(Key));
      if(HumanEscape(k.vk,k.flags)){
        int m=message.ToInt32();
        if(m==0x101||m==0x105)down=false;
        if(enabled&&(m==0x100||m==0x104)){
          if(!down){down=true;Console.WriteLine("stop");Console.Out.Flush();}
          return new IntPtr(1);
        }
      }
    }
    return CallNextHookEx(hook,code,message,data);
  }
  [STAThread] static int Main(string[] args){
    if(args.Length>0&&args[0]=="--self-test"){
      bool ok=HumanEscape(27,0)&&!HumanEscape(27,16)&&!HumanEscape(27,2)&&!HumanEscape(65,0);
      Console.WriteLine(ok?"physical Escape only: passed":"failed");return ok?0:1;
    }
    context=new ApplicationContext();
    hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);
    if(hook==IntPtr.Zero)return 2;
    var synchronizer=new Control();synchronizer.CreateControl();
    var handle=synchronizer.Handle;
    new Thread(()=>{try{string line;while((line=Console.ReadLine())!=null)enabled=line=="enable";}finally{try{synchronizer.BeginInvoke(new Action(()=>context.ExitThread()));}catch{}}}){IsBackground=true}.Start();
    Console.WriteLine("ready");Console.Out.Flush();
    try{Application.Run(context);}finally{UnhookWindowsHookEx(hook);synchronizer.Dispose();}
    return 0;
  }
}
