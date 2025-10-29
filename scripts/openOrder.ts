import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
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

  const timeStamp = new anchor.BN(Math.floor(Date.now() / 1000));

  const [orderPda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("dca_order"),
      user.toBuffer(),
      timeStamp.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
  console.log(timeStamp);

  const mint = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    mint,
    user
  );

  const orderTokenAccount = anchor.utils.token.associatedAddress({
    mint,
    owner: orderPda,
  });

  const params = {
    fromToken: mint, // spl token
    fromChainId: new anchor.BN(10002),
    amountIn: new anchor.BN(1_000_000),
    amountOutMin: new Uint8Array([1, ...Array(31).fill(0)]), // 表示 value = 1
    amountOutMax: new Uint8Array([10, ...Array(31).fill(0)]), // 表示 value = 10
    toChainId: new anchor.BN(10001),
    toToken: new Uint8Array(Buffer.from("satoxi".padEnd(32, "\0"))),
    recipient: (() => {
      const arr = new Uint8Array(32);
      arr.set(user.toBytes());
      return arr;
    })(),
    executeCount: new anchor.BN(2),
    timeInterval: new anchor.BN(3600),
    timeStamp: timeStamp,
  };

  await program.methods
    .openOrderSpl(params)
    .accounts({
      order: orderPda,
      user,
      userTokenAccount: userTokenAccount.address,
      orderTokenAccount,
      tokenMint: mint,
      global_config: globalConfigPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    })
    .rpc();

  // const params = {
  //   fromToken: new PublicKey("So11111111111111111111111111111111111111112"),
  //   fromChainId: new anchor.BN(10002),
  //   amountIn: new anchor.BN(10_000_000),
  //   amountOutMin: new Uint8Array([1, ...Array(31).fill(0)]), // 表示 value = 1
  //   amountOutMax: new Uint8Array([10, ...Array(31).fill(0)]), // 表示 value = 10
  //   toChainId: new anchor.BN(1),
  //   toToken: new Uint8Array(Buffer.from("satoxi".padEnd(32, "\0"))),
  //   recipient: (() => {
  //     const arr = new Uint8Array(32);
  //     arr.set(user.toBytes());
  //     return arr;
  //   })(),
  //   executeCount: new anchor.BN(2),
  //   timeInterval: new anchor.BN(3600),
  //   timeStamp: timeStamp,
  // };

  // // 执行 open_order_sol
  // await program.methods
  //   .openOrderSol(params)
  //   .accounts({
  //     order: orderPda,
  //     user: user,
  //     global_config: globalConfigPda,
  //     systemProgram: SystemProgram.programId,
  //   })
  //   .rpc();
}

main();
