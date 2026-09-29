using System;
using System.Windows.Forms;
class CuaTarget {
  [STAThread] static void Main() {
    var form=new Form {Text="DSH CUA Adaptation Test",Width=450,Height=180};
    var edit=new TextBox {Name="AcceptanceInput",AccessibleName="AcceptanceInput",Left=20,Top=20,Width=350};
    var button=new Button {Text="Verify",AccessibleName="Verify",Left=20,Top=60};
    var label=new TextBox {Text="Ready",Name="Outcome",AccessibleName="Outcome",ReadOnly=true,Left=120,Top=65,Width=250};
    button.Click+=(s,e)=>label.Text="Verified "+edit.Text;
    form.Controls.AddRange(new Control[]{edit,button,label});
    form.Shown+=(s,e)=>Console.WriteLine(form.Handle.ToInt64());
    Application.Run(form);
  }
}
