import { createClient } from 'npm:@insforge/sdk@1.5.2';
export default async function(request) {
 const token=Deno.env.get('NUSA_CRON_TOKEN');
 if(request.method!=='POST'||!token||request.headers.get('Authorization')!=='Bearer '+token)return Response.json({error:'Forbidden'},{status:403});
 const client=createClient({baseUrl:Deno.env.get('INSFORGE_BASE_URL'),anonKey:Deno.env.get('ANON_KEY')});
 const {data,error}=await client.database.rpc('nusa_run_maintenance',{token});
 return Response.json(error?{error:'Maintenance failed'}:data,{status:error?500:200});
}
