package com.ms;

import com.ms.utils.PromptUtils;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;

@SpringBootTest
public class PromptReadTest {

    @Autowired
    private PromptUtils promptUtils;

    @Test
    void ReadPrompt()  {
        try {
            String context = promptUtils.readPrompt("GenImgsTagPrompt");
            System.out.println("##############################");
            System.out.println(context);
            System.out.println("##############################");
        }catch (IOException e){
            System.out.println("文件读取错误,ERROR:"+e);
        }
    }
}
