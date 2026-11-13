using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Security.Cryptography;
class Host {
 static byte[] Read(Stream s,int n) { byte[] b=new byte[n];int p=0;while(p<n){int r=s.Read(b,p,n-p);if(r==0)throw new EndOfStreamException();p+=r;}return b; }
 static string Secret() {
  string dir=Environment.GetEnvironmentVariable("CANNON_TEST_DATA");if(String.IsNullOrWhiteSpace(dir))dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"peopleping-opportunity-cannon");Directory.CreateDirectory(dir);
  string file=Path.Combine(dir,"browser-bridge.dpapi");
  if(!File.Exists(file)){byte[] key=new byte[32];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(key);try{using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write)) {var data=ProtectedData.Protect(key,null,DataProtectionScope.CurrentUser);stream.Write(data,0,data.Length);}}catch(IOException){}}
  return BitConverter.ToString(ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser)).Replace("-", "").ToLowerInvariant();
 }
 static void Main(string[] args) {
  if(args.Length==1 && args[0]=="--secret"){Console.Write(Secret());return;}
  if(args.Length==0 || args[0]!="chrome-extension://aniflijjcgbekbpcpmkljoeflifjhobl/")return;
  var input=Console.OpenStandardInput();var output=Console.OpenStandardOutput();
  string hash=BitConverter.ToString(SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("USERPROFILE")??""))).Replace("-", "").ToLowerInvariant().Substring(0,24);
  try { while(true) {
   int n=BitConverter.ToInt32(Read(input,4),0);if(n<2||n>8192)return;
   string request=Encoding.UTF8.GetString(Read(input,n));string response;
   try { using(var pipe=new NamedPipeClientStream(".","opportunity-cannon-"+hash,PipeDirection.InOut)) {
    pipe.Connect(2000);var writer=new StreamWriter(pipe,new UTF8Encoding(false));writer.AutoFlush=true;writer.WriteLine("{\"auth\":\""+Secret()+"\",\"message\":"+request+"}");
    response=new StreamReader(pipe,Encoding.UTF8).ReadLine();if(response==null||response.Length>750000) return;
   }} catch {response="{\"error\":\"Desktop unavailable. Open Opportunity Cannon and reconnect.\"}";}
   byte[] b=Encoding.UTF8.GetBytes(response);output.Write(BitConverter.GetBytes(b.Length),0,4);output.Write(b,0,b.Length);output.Flush();
  }} catch { }
 }
}
