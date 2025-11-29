package com.voicestreamai.sst.config;

import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/**
 * Provides access to Spring ApplicationContext for non-Spring managed components
 * (e.g., WebSocket endpoints annotated with @ServerEndpoint)
 */
@Component
public class ApplicationContextProvider implements ApplicationContextAware {
    
    private static ApplicationContext context;
    
    @Override
    public void setApplicationContext(ApplicationContext applicationContext) {
        context = applicationContext;
    }
    
    public static ApplicationContext getApplicationContext() {
        return context;
    }
    
    public static <T> T getBean(Class<T> beanClass) {
        return context.getBean(beanClass);
    }
}
