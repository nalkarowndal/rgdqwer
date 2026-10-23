export function allowAudioPermission(input:{permission:string;origin:string;appOrigin:string;sameContents:boolean;mainFrame:boolean;mediaTypes:string[]}):boolean {
 try{return input.permission==='media'&&input.sameContents&&input.mainFrame&&new URL(input.origin).origin===input.appOrigin&&input.mediaTypes.length===1&&input.mediaTypes[0]==='audio';}catch{return false;}
}
