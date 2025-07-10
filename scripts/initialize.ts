import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.interraDcaOrderSolana as anchor.Program;

  const user = provider.wallet.publicKey;

  let globalConfigPda: PublicKey;

  [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-config")],
    program.programId
  );
  console.log(globalConfigPda);

  await program.methods
    .initialize(50, user)
    .accounts({
      global_config: globalConfigPda,
      signer: user,
      system_program: SystemProgram.programId,
    })
    .rpc();
}

main();
