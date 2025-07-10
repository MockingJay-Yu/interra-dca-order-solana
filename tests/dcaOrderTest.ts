import * as anchor from "@coral-xyz/anchor";
import { AnchorError } from "@coral-xyz/anchor";

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
import { expect } from "chai";
import { createSolOrder, createSplOrder } from "./dcaOrderTestHelpers";

describe("globalConfig test", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.interraDcaOrderSolana as anchor.Program;

  const user = provider.wallet.publicKey;
  let globalConfigPda: PublicKey;

  it("initializes the global config", async () => {
    // Derive global_config PDA
    [globalConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-config")],
      program.programId
    );
    const platformFee = 30;

    const listener = await program.addEventListener(
      "Initialized",
      (event: any, slot) => {
        try {
          expect(event.owner.toBase58()).to.equal(user.toBase58());
          expect(event.platform_fee.toNumber()).to.equal(platformFee);
          expect(event.treasury.toBase58()).to.equal(user.toBase58());
          expect(event.paused()).to.equal(false);
        } catch (e) {
          console.error("Event assertion failed:", e);
          throw e;
        }
      }
    );

    await program.methods
      .initialize(platformFee, user)
      .accounts({
        global_config: globalConfigPda,
        signer: user,
        system_program: SystemProgram.programId,
      })
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 500));
    await program.removeEventListener(listener);

    const config = await program.account["globalConfig"].fetch(globalConfigPda);

    expect(config.owner.toBase58()).to.equal(user.toBase58());
    expect(config.platformFee).to.equal(platformFee);
    expect(config.treasury.toBase58()).to.equal(user.toBase58());
    expect(config.paused).to.equal(false);
  });

  it("should fail if non-owner tries to update global config", async () => {
    const nonOwner = anchor.web3.Keypair.generate();

    const airdropSignature = await provider.connection.requestAirdrop(
      nonOwner.publicKey,
      1_000_000_000 // 1 SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    let caughtError = null;
    try {
      await program.methods
        .updateConfig(nonOwner.publicKey, 50, nonOwner.publicKey, false)
        .accounts({
          global_config: globalConfigPda,
          owner: nonOwner.publicKey,
        })
        .signers([nonOwner])
        .rpc();
    } catch (err) {
      caughtError = err;
    }
    const anchorError = caughtError as AnchorError;
    expect(anchorError.error.errorCode.code).to.equal("ConstraintHasOne");
  });

  it("should success if owner tries to update global config", async () => {
    const platformFee = 50;

    const listener = await program.addEventListener(
      "ConfigUpdated",
      (event: any, slot) => {
        try {
          expect(event.owner.toBase58()).to.equal(user.toBase58());
          expect(event.platform_fee.toNumber()).to.equal(platformFee);
          expect(event.treasury.toBase58()).to.equal(user.toBase58());
          expect(event.paused()).to.equal(false);
        } catch (e) {
          console.error("Event assertion failed:", e);
          throw e;
        }
      }
    );

    await program.methods
      .updateConfig(user, platformFee, user, false)
      .accounts({
        global_config: globalConfigPda,
        owner: user,
      })
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 500));
    await program.removeEventListener(listener);

    const config = await program.account["globalConfig"].fetch(globalConfigPda);

    expect(config.owner.toBase58()).to.equal(user.toBase58());
    expect(config.platformFee).to.equal(platformFee);
    expect(config.treasury.toBase58()).to.equal(user.toBase58());
    expect(config.paused).to.equal(false);
  });
});

describe("openOrder test", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.interraDcaOrderSolana as anchor.Program;
  const user = provider.wallet.publicKey;

  let globalConfig: PublicKey;
  [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-config")],
    program.programId
  );
  it("should open a SOL dca order", async () => {
    const amount = new anchor.BN(1_000_000);

    // 事件监听器
    const listener = await program.addEventListener(
      "OrderOpened",
      (event: any) => {
        try {
          expect(event.orderPubkey.toBase58()).to.equal(orderPda.toBase58());
        } catch (e) {
          console.error("Event assertion failed:", e);
          throw e;
        }
      }
    );

    // 创建一个sol订单
    const [orderPda, openOrderParams, bump] = await createSolOrder(
      program,
      user,
      amount,
      globalConfig
    );

    // 等待事件
    await new Promise((res) => setTimeout(res, 500));
    await program.removeEventListener(listener);

    // 获取订单账户
    const orderAccount = await program.account["dcaOrder"].fetch(orderPda);

    // 数据断言
    expect(orderAccount.fromToken.toBase58()).to.equal(
      openOrderParams.fromToken.toBase58()
    );
    expect(orderAccount.fromChainId.toString()).to.equal(
      openOrderParams.fromChainId.toString()
    );
    expect(orderAccount.amountIn.toString()).to.equal(
      openOrderParams.amountIn.toString()
    );
    expect(Buffer.from(orderAccount.amountOutMin)).to.eql(
      Buffer.from(openOrderParams.amountOutMin)
    );
    expect(Buffer.from(orderAccount.amountOutMax)).to.eql(
      Buffer.from(openOrderParams.amountOutMax)
    );
    expect(orderAccount.toChainId.toString()).to.equal(
      openOrderParams.toChainId.toString()
    );
    expect(Buffer.from(orderAccount.toToken)).to.eql(
      Buffer.from(openOrderParams.toToken)
    );
    expect(Buffer.from(orderAccount.recipient)).to.eql(
      Buffer.from(openOrderParams.recipient)
    );
    expect(orderAccount.sender.toBase58()).to.equal(user.toBase58());
    expect(orderAccount.executeCount.toString()).to.equal(
      openOrderParams.executeCount.toString()
    );
    expect(orderAccount.remainingExecuteCount.toString()).to.equal(
      openOrderParams.executeCount.toString()
    );
    expect(orderAccount.timeInterval.toString()).to.equal(
      openOrderParams.timeInterval.toString()
    );
    expect(orderAccount.remainingAmount.toString()).to.equal(
      openOrderParams.amountIn.toString()
    );
    expect(orderAccount.timeStamp.toString()).to.equal(
      openOrderParams.timeStamp.toString()
    );
    expect(orderAccount.bump).to.equal(bump);

    // 检查 PDA 中 lamports 是否到账
    const accountInfo = await provider.connection.getAccountInfo(orderPda);
    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(
        program.account["dcaOrder"].size
      );
    expect(accountInfo.lamports).to.be.at.least(
      openOrderParams.amountIn.toNumber() + rentExempt
    );
  });

  it("should open a SPL-token dca order", async () => {
    // 1. 创建一个测试 SPL Token mint
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      user,
      null,
      6 // decimals
    );

    // 2. 获取用户的 ATA
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      user
    );

    // 3. 给用户 mint 一些测试 token
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userTokenAccount.address,
      user,
      1000_000_000
    );

    // 4. 添加事件监听器
    const listener = await program.addEventListener(
      "OrderOpened",
      (event: any, slot) => {
        try {
          expect(event.orderPubkey.toBase58()).to.equal(orderPda.toBase58());
        } catch (e) {
          console.error("Event assertion failed:", e);
          throw e;
        }
      }
    );

    // 5. 创建spl订单
    const amount = new anchor.BN(1_000_000);

    const [orderPda, orderTokenAccount, openOrderParams, bump] =
      await createSplOrder(program, provider, user, mint, amount, globalConfig);

    // 6. 等待事件处理
    await new Promise((resolve) => setTimeout(resolve, 500));
    await program.removeEventListener(listener);

    // 7. 查询 order 账户，检查存储
    const orderAccount = await program.account["dcaOrder"].fetch(orderPda);

    // 8. 验证数据存储
    expect(orderAccount.fromToken.toBase58()).to.equal(
      openOrderParams.fromToken.toBase58()
    );
    expect(orderAccount.fromChainId.toString()).to.equal(
      openOrderParams.fromChainId.toString()
    );
    expect(orderAccount.amountIn.toString()).to.equal(
      openOrderParams.amountIn.toString()
    );
    expect(Buffer.from(orderAccount.amountOutMin)).to.eql(
      Buffer.from(openOrderParams.amountOutMin)
    );
    expect(Buffer.from(orderAccount.amountOutMax)).to.eql(
      Buffer.from(openOrderParams.amountOutMax)
    );
    expect(orderAccount.toChainId.toString()).to.equal(
      openOrderParams.toChainId.toString()
    );
    expect(Buffer.from(orderAccount.toToken)).to.eql(
      Buffer.from(openOrderParams.toToken)
    );
    expect(Buffer.from(orderAccount.recipient)).to.eql(
      Buffer.from(openOrderParams.recipient)
    );
    expect(orderAccount.sender.toBase58()).to.equal(user.toBase58());
    expect(orderAccount.executeCount.toString()).to.equal(
      openOrderParams.executeCount.toString()
    );
    expect(orderAccount.remainingExecuteCount.toString()).to.equal(
      openOrderParams.executeCount.toString()
    );
    expect(orderAccount.timeInterval.toString()).to.equal(
      openOrderParams.timeInterval.toString()
    );
    expect(orderAccount.remainingAmount.toString()).to.equal(
      openOrderParams.amountIn.toString()
    );
    expect(orderAccount.timeStamp.toString()).to.equal(
      openOrderParams.timeStamp.toString()
    );
    expect(orderAccount.bump).to.equal(bump);

    //9. 验证spl token是否到账

    const orderTokenAccountInfo = await getAccount(
      provider.connection,
      orderTokenAccount
    );
    expect(orderTokenAccountInfo.amount).to.equal(
      BigInt(openOrderParams.amountIn.toString())
    );
  });
});
