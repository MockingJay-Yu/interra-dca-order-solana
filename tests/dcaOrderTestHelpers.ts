import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

type OpenOrderParams = {
  fromToken: PublicKey;
  fromChainId: anchor.BN;
  amountIn: anchor.BN;
  amountOutMin: Uint8Array; // [u8; 32]
  amountOutMax: Uint8Array; // [u8; 32]
  toChainId: anchor.BN;
  toToken: Uint8Array; // [u8; 32]
  recipient: Uint8Array; // [u8; 32]
  executeCount: anchor.BN; // u16
  timeInterval: anchor.BN;
  timeStamp: anchor.BN;
};

export async function createSolOrder(
  program: anchor.Program,
  user: PublicKey,
  amountIn: anchor.BN,
  globalConfig: PublicKey
): Promise<[PublicKey, OpenOrderParams, number]> {
  const timeStamp = new anchor.BN(Math.floor(Date.now() / 1000));
  const [orderPda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("dca_order"),
      user.toBuffer(),
      timeStamp.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  const params = {
    fromToken: new PublicKey("So11111111111111111111111111111111111111112"), // native SOL
    fromChainId: new anchor.BN(10002),
    amountIn,
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

  // 执行 open_order_sol
  await program.methods
    .openOrderSol(params)
    .accounts({
      order: orderPda,
      user: user,
      global_config: globalConfig,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return [orderPda, params, bump];
}

export async function createSplOrder(
  program: anchor.Program,
  provider: anchor.AnchorProvider,
  user: PublicKey,
  mint: PublicKey,
  amountIn: anchor.BN,
  globalConfig: PublicKey
): Promise<[PublicKey, PublicKey, OpenOrderParams, number]> {
  const timeStamp = new anchor.BN(Math.floor(Date.now() / 1000));
  const [orderPda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("dca_order"),
      user.toBuffer(),
      timeStamp.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

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
    amountIn,
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
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    })
    .rpc();

  return [orderPda, orderTokenAccount, params, bump];
}
